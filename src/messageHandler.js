/**
 * MAIA Message Handler
 * Verarbeitet eingehende WhatsApp-Nachrichten und orchestriert die Antwort.
 */

const { sendTextMessage, sendReaction, markAsRead, downloadMedia } = require('./whatsapp');
const { MODULES, detectModule, getModuleMenuText, numberToModule } = require('./modules');
const { callClaude, callClaudeWithImage } = require('./claude');
const { getUser, setUserModule, addMessage, getHistory, parseAndSaveReminder } = require('./database');
const {
  isSOS, isEmergencySetup, detectCrisis,
  triggerSOS, handleCrisisSignal, startEmergencySetup, parseAndSaveContact
} = require('./emergency');

/**
 * Eingehende Nachricht verarbeiten
 */
async function handleIncomingMessage(message, metadata) {
  const from = message.from; // Telefonnummer des Absenders
  const msgId = message.id;
  const msgType = message.type;

  console.log(`[Nachricht] Von: ${from} | Typ: ${msgType}`);

  // Nachricht als gelesen markieren
  await markAsRead(msgId);

  // ── Bild-Nachricht ─────────────────────────────────────
  if (msgType === 'image') {
    await handleImageMessage(from, message);
    return;
  }

  // ── Button/Interactive-Antwort ─────────────────────────
  if (msgType === 'interactive') {
    const buttonId = message.interactive?.button_reply?.id
      || message.interactive?.list_reply?.id;
    if (buttonId && MODULES[buttonId]) {
      await switchModule(from, buttonId);
      return;
    }
  }

  // ── Text-Nachricht ─────────────────────────────────────
  if (msgType === 'text') {
    const text = message.text?.body?.trim();
    if (!text) return;

    await handleTextMessage(from, text);
    return;
  }

  // ── Unbekannter Typ ────────────────────────────────────
  await sendTextMessage(from,
    'Entschuldigung, diesen Nachrichtentyp kann ich leider noch nicht verarbeiten. ' +
    'Bitte senden Sie mir eine Textnachricht oder ein Foto.'
  );
}

/**
 * Text-Nachricht verarbeiten
 */
async function handleTextMessage(from, text) {
  const user = getUser(from);

  // ── NOTFALL: höchste Priorität ──────────────────────────

  // SOS → sofort Vertrauensperson benachrichtigen
  if (isSOS(text)) {
    await triggerSOS(from, 'manual_sos');
    return;
  }

  // Notfallkontakt einrichten/verwalten
  if (isEmergencySetup(text)) {
    await startEmergencySetup(from);
    return;
  }

  // "Notfallkontakt: Name, Beziehung, Nummer" → speichern
  if (/^notfallkontakt[:\s]/i.test(text)) {
    await parseAndSaveContact(from, text);
    return;
  }

  // Krisensignale erkennen (läuft vor allem anderen)
  const crisisType = detectCrisis(text);
  if (crisisType) {
    const handled = await handleCrisisSignal(from, text, crisisType);
    if (handled && crisisType === 'medical') return;
    // Bei 'mental' lassen wir die Nachricht trotzdem durch zu Claude
    // damit MAIA einfühlsam antwortet
  }

  // ── Spezial-Befehle ────────────────────────────────────

  // "Menü" / "Start" / "Hilfe" → Modul-Auswahl
  if (/^(men[üu]|start|hilfe|hallo|hi|maia)$/i.test(text)) {
    await sendTextMessage(from, getModuleMenuText());
    return;
  }

  // Nummer 1–5 → Modul wechseln
  const numModule = numberToModule(text);
  if (numModule) {
    await switchModule(from, numModule);
    return;
  }

  // "Erinnerung" / "Erinnere mich" → Erinnerung parsen
  if (/erinner/i.test(text)) {
    const saved = parseAndSaveReminder(from, text);
    if (saved) {
      await sendTextMessage(from,
        `✅ Erinnerung gespeichert!\n\n` +
        `📅 *${saved.label}*\n` +
        `⏰ ${saved.displayTime}\n\n` +
        `_Ich erinnere Sie rechtzeitig._`
      );
      return;
    }
    // Wenn Parsing fehlschlägt, fällt durch zu Claude
  }

  // ── Modul-Erkennung ────────────────────────────────────
  // Wenn der User noch kein Modul gewählt hat oder ein neues Thema anspricht
  const detectedModule = detectModule(text);
  if (detectedModule && detectedModule !== user.currentModule) {
    setUserModule(from, detectedModule);
    const mod = MODULES[detectedModule];
    await sendTextMessage(from,
      `${mod.icon} _Wechsel zu: ${mod.name}_\n\n`
    );
    // Nachricht trotzdem an Claude weiterleiten
  }

  const activeModule = detectedModule || user.currentModule || 'gesundheit';

  // Falls noch nie ein Modul gesetzt wurde
  if (!user.currentModule) {
    setUserModule(from, activeModule);
  }

  // ── An Claude senden ───────────────────────────────────
  await sendReaction(from, undefined, '🤔'); // "Denkt nach" Indikator

  // Nachricht in Historie speichern
  addMessage(from, 'user', text, activeModule);

  // Konversationshistorie laden (letzte 10 Nachrichten)
  const history = getHistory(from, activeModule, 10);

  try {
    const response = await callClaude(activeModule, history);

    // Antwort in Historie speichern
    addMessage(from, 'assistant', response, activeModule);

    // Antwort senden
    await sendTextMessage(from, response);

  } catch (err) {
    console.error('[Claude] Fehler:', err.message);
    await sendTextMessage(from,
      '⚠️ Entschuldigung, es gab ein technisches Problem. ' +
      'Bitte versuchen Sie es in einem Moment erneut.'
    );
  }
}

/**
 * Bild-Nachricht verarbeiten (Arztbriefe, Dokumente, etc.)
 */
async function handleImageMessage(from, message) {
  const user = getUser(from);
  const activeModule = user.currentModule || 'gesundheit';
  const caption = message.image?.caption || '';
  const mediaId = message.image?.id;

  if (!mediaId) {
    await sendTextMessage(from, 'Das Bild konnte leider nicht verarbeitet werden.');
    return;
  }

  await sendTextMessage(from, '📄 _Bild wird analysiert... einen Moment bitte._');

  try {
    // Bild herunterladen
    const { buffer, mimeType } = await downloadMedia(mediaId);

    // An Claude mit Vision senden
    const userText = caption || 'Bitte analysieren Sie dieses Dokument und erklären Sie mir den Inhalt in einfacher Sprache.';

    addMessage(from, 'user', `[Bild gesendet] ${userText}`, activeModule);

    const response = await callClaudeWithImage(activeModule, buffer, mimeType, userText);

    addMessage(from, 'assistant', response, activeModule);
    await sendTextMessage(from, response);

  } catch (err) {
    console.error('[Vision] Fehler:', err.message);
    await sendTextMessage(from,
      '⚠️ Das Bild konnte leider nicht analysiert werden. ' +
      'Bitte versuchen Sie es mit einem deutlicheren Foto oder beschreiben Sie den Inhalt als Text.'
    );
  }
}

/**
 * Modul wechseln und Willkommensnachricht senden
 */
async function switchModule(from, moduleId) {
  setUserModule(from, moduleId);
  const mod = MODULES[moduleId];
  await sendTextMessage(from, mod.welcomeMessage);
}

module.exports = { handleIncomingMessage };
