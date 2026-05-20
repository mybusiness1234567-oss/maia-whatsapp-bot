/**
 * MAIA Notfall-System
 *
 * Features:
 * 1. Vertrauensperson hinterlegen (Sohn, Tochter, Nachbar...)
 * 2. SOS-Befehl → sofortige Benachrichtigung an Vertrauensperson
 * 3. Automatische Erkennung von Krisensignalen in Nachrichten
 * 4. Kontext-Weitergabe: letzte Nachrichten an die Vertrauensperson
 */

const { sendTextMessage, sendButtonMessage } = require('./whatsapp');
const {
  addEmergencyContact,
  getEmergencyContacts,
  getPrimaryEmergencyContact,
  removeEmergencyContact,
  logEmergency,
  getRecentMessages,
  getUser
} = require('./database');

// ── Krisensignale ────────────────────────────────────────
// Wörter/Phrasen, bei denen MAIA vorsichtig nachfragt
const CRISIS_KEYWORDS = [
  'will nicht mehr',
  'keinen sinn',
  'möchte sterben',
  'bringe mich um',
  'alles beenden',
  'es reicht',
  'niemand braucht mich',
  'ganz allein',
  'schaffe es nicht mehr',
  'hilfe',
  'notfall',
  'gestürzt',
  'kann nicht aufstehen',
  'starke schmerzen',
  'atemnot',
  'brustschmerzen',
  'bewusstlos'
];

// Medizinische Notfall-Keywords → direkter Hinweis auf 112
const MEDICAL_EMERGENCY = [
  'gestürzt',
  'kann nicht aufstehen',
  'starke schmerzen',
  'atemnot',
  'brustschmerzen',
  'bewusstlos',
  'herzinfarkt',
  'schlaganfall',
  'blut',
  'ohnmacht'
];

/**
 * Prüft ob eine Nachricht ein SOS-Befehl ist
 */
function isSOS(text) {
  const lower = text.toLowerCase().trim();
  return /^(sos|notruf|hilfe!|notfall)$/i.test(lower);
}

/**
 * Prüft ob der Nutzer einen Notfallkontakt einrichten will
 */
function isEmergencySetup(text) {
  const lower = text.toLowerCase();
  return /^(notfallkontakt|vertrauensperson|sos.?kontakt|notfall\s+einrichten)/i.test(lower)
    || /kontakt.*hinterlegen/i.test(lower)
    || /vertrauensperson.*einrichten/i.test(lower);
}

/**
 * Prüft Nachricht auf Krisensignale
 * Gibt den Typ zurück: 'medical', 'mental', oder null
 */
function detectCrisis(text) {
  const lower = text.toLowerCase();

  // Medizinischer Notfall
  if (MEDICAL_EMERGENCY.some(kw => lower.includes(kw))) {
    return 'medical';
  }

  // Psychische Krise
  if (CRISIS_KEYWORDS.some(kw => lower.includes(kw))) {
    return 'mental';
  }

  return null;
}

/**
 * SOS auslösen — Vertrauensperson benachrichtigen
 */
async function triggerSOS(phone, reason = 'manual_sos') {
  const contact = getPrimaryEmergencyContact(phone);
  const user = getUser(phone);
  const userName = user.name || phone;

  if (!contact) {
    await sendTextMessage(phone,
      '🚨 *SOS-Funktion*\n\n' +
      'Sie haben noch keine Vertrauensperson hinterlegt.\n\n' +
      'Schreiben Sie *"Notfallkontakt"* um eine Vertrauensperson einzurichten.\n\n' +
      '📞 *Bei akutem Notfall rufen Sie bitte 112 an.*'
    );
    return false;
  }

  // Letzte Nachrichten für Kontext sammeln
  const recentMsgs = getRecentMessages(phone, 5);
  let context = '';
  if (recentMsgs.length > 0) {
    context = '\n\n📋 *Letzte Nachrichten:*\n' +
      recentMsgs.map(m =>
        `${m.role === 'user' ? '👤' : '🤖'} _${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}_`
      ).join('\n');
  }

  // Nachricht an Vertrauensperson
  const alertMessage =
    '🚨 *MAIA Notfall-Benachrichtigung*\n\n' +
    `${contact.contact_name}, die Person *${userName}* ` +
    `(${formatPhone(phone)}) hat über MAIA einen Notfall ausgelöst.\n\n` +
    `📍 *Grund:* ${getReasonText(reason)}\n` +
    `⏰ *Zeit:* ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}` +
    context + '\n\n' +
    '👉 *Bitte kontaktieren Sie die Person oder rufen Sie 112 an.*\n\n' +
    '_Diese Nachricht wurde automatisch von MAIA gesendet — dem AI-Assistenten von AI Pioneer._';

  try {
    await sendTextMessage(contact.contact_phone, alertMessage);

    // Log speichern
    logEmergency(phone, contact.contact_phone, reason, alertMessage);

    // Bestätigung an den Nutzer
    await sendTextMessage(phone,
      '✅ *Ihre Vertrauensperson wurde benachrichtigt!*\n\n' +
      `📱 ${contact.contact_name} (${contact.relationship || 'Vertrauensperson'}) ` +
      'hat eine Nachricht erhalten.\n\n' +
      '📞 *Bei akutem Notfall: Rufen Sie immer auch 112 an!*'
    );

    return true;
  } catch (err) {
    console.error('[Emergency] Fehler beim Senden:', err.message);
    await sendTextMessage(phone,
      '⚠️ Die Benachrichtigung konnte leider nicht gesendet werden.\n\n' +
      '📞 *Bitte rufen Sie direkt 112 an oder kontaktieren Sie ' +
      `${contact.contact_name} unter ${formatPhone(contact.contact_phone)}.*`
    );
    return false;
  }
}

/**
 * Krisensignal behandeln — sanft nachfragen + Hilfe anbieten
 */
async function handleCrisisSignal(phone, text, crisisType) {
  if (crisisType === 'medical') {
    // Medizinischer Notfall → sofort ernst nehmen
    const contact = getPrimaryEmergencyContact(phone);
    const contactInfo = contact
      ? `\n\nSchreiben Sie *SOS* und ich benachrichtige sofort ${contact.contact_name}.`
      : '\n\nSchreiben Sie *"Notfallkontakt"* um eine Vertrauensperson zu hinterlegen.';

    await sendTextMessage(phone,
      '🚨 *Das klingt nach einem medizinischen Notfall.*\n\n' +
      '📞 *Bitte rufen Sie sofort 112 an!*\n\n' +
      'Die Rettungsleitstelle kann Ihnen am schnellsten helfen.' +
      contactInfo
    );
    return true;
  }

  if (crisisType === 'mental') {
    // Psychische Krise → einfühlsam reagieren
    await sendTextMessage(phone,
      'Ich höre, dass es Ihnen gerade nicht gut geht. ' +
      'Das ist eine schwierige Situation und es ist mutig, das auszusprechen.\n\n' +
      '📞 *Telefonseelsorge: 0800 111 0 111*\n' +
      '_Rund um die Uhr, kostenlos, anonym._\n\n' +
      'Möchten Sie, dass ich Ihre Vertrauensperson benachrichtige? ' +
      'Schreiben Sie einfach *SOS*.'
    );
    return true;
  }

  return false;
}

/**
 * Notfallkontakt-Einrichtung starten
 */
async function startEmergencySetup(phone) {
  const existing = getEmergencyContacts(phone);

  if (existing.length > 0) {
    let contactList = existing.map((c, i) =>
      `${i + 1}. *${c.contact_name}* (${c.relationship || 'Kontakt'}) — ${formatPhone(c.contact_phone)}${c.is_primary ? ' ⭐' : ''}`
    ).join('\n');

    await sendTextMessage(phone,
      '📋 *Ihre Notfallkontakte:*\n\n' +
      contactList + '\n\n' +
      'Um einen *neuen Kontakt* hinzuzufügen, schreiben Sie:\n' +
      '_Notfallkontakt: Thomas, Sohn, +4917612345678_\n\n' +
      'Um einen Kontakt zu *entfernen*, schreiben Sie:\n' +
      '_Notfallkontakt löschen: +4917612345678_'
    );
    return;
  }

  await sendTextMessage(phone,
    '🛡️ *Notfallkontakt einrichten*\n\n' +
    'Hinterlegen Sie eine Vertrauensperson, die im Notfall benachrichtigt wird.\n\n' +
    'Schreiben Sie die Infos in diesem Format:\n' +
    '*Notfallkontakt: Name, Beziehung, Telefonnummer*\n\n' +
    'Beispiele:\n' +
    '• _Notfallkontakt: Thomas, Sohn, +4917612345678_\n' +
    '• _Notfallkontakt: Maria Schmidt, Nachbarin, +4915198765432_\n\n' +
    'Die Person bekommt *nur dann* eine Nachricht, wenn Sie *SOS* schreiben ' +
    'oder MAIA ein mögliches Problem erkennt.'
  );
}

/**
 * Notfallkontakt aus Nachricht parsen und speichern
 */
async function parseAndSaveContact(phone, text) {
  // "Notfallkontakt löschen: +49..."
  const deleteMatch = text.match(/l[öo]schen[:\s]+(\+?\d[\d\s]+)/i);
  if (deleteMatch) {
    const contactPhone = deleteMatch[1].replace(/\s/g, '');
    removeEmergencyContact(phone, contactPhone);
    await sendTextMessage(phone, `✅ Notfallkontakt ${contactPhone} wurde entfernt.`);
    return true;
  }

  // "Notfallkontakt: Name, Beziehung, +49..."
  const addMatch = text.match(/notfallkontakt[:\s]+(.+)/i);
  if (!addMatch) return false;

  const parts = addMatch[1].split(',').map(p => p.trim());

  if (parts.length < 2) {
    await sendTextMessage(phone,
      '❌ Bitte geben Sie die Infos so an:\n' +
      '_Notfallkontakt: Name, Beziehung, Telefonnummer_\n\n' +
      'Beispiel: _Notfallkontakt: Thomas, Sohn, +4917612345678_'
    );
    return true;
  }

  // Telefonnummer finden (letztes Element mit Ziffern)
  let contactPhone = null;
  let contactName = parts[0];
  let relationship = null;

  for (let i = parts.length - 1; i >= 0; i--) {
    const cleaned = parts[i].replace(/\s/g, '');
    if (/^\+?\d{8,}$/.test(cleaned)) {
      contactPhone = cleaned;
      parts.splice(i, 1);
      break;
    }
  }

  if (!contactPhone) {
    await sendTextMessage(phone,
      '❌ Ich konnte keine Telefonnummer erkennen.\n\n' +
      'Bitte geben Sie die Nummer mit Ländervorwahl an:\n' +
      '_Notfallkontakt: Thomas, Sohn, +4917612345678_'
    );
    return true;
  }

  // Name und Beziehung zuweisen
  contactName = parts[0] || 'Vertrauensperson';
  relationship = parts[1] || null;

  // Speichern
  const result = addEmergencyContact(phone, contactPhone, contactName, relationship);

  const actionText = result.updated ? 'aktualisiert' : 'gespeichert';
  await sendTextMessage(phone,
    `✅ *Notfallkontakt ${actionText}!*\n\n` +
    `👤 *${contactName}*${relationship ? ` (${relationship})` : ''}\n` +
    `📱 ${formatPhone(contactPhone)}\n\n` +
    `Wenn Sie *SOS* schreiben, wird ${contactName} sofort benachrichtigt.\n\n` +
    `_${contactName} erhält Ihren Namen und die letzten Nachrichten als Kontext._`
  );

  return true;
}

// ── Hilfsfunktionen ──────────────────────────────────────

function formatPhone(phone) {
  // +4917612345678 → +49 176 1234 5678
  if (phone.startsWith('+49') && phone.length >= 13) {
    return phone.replace(/(\+49)(\d{3})(\d{4})(\d+)/, '$1 $2 $3 $4');
  }
  return phone;
}

function getReasonText(reason) {
  const reasons = {
    'manual_sos': 'SOS manuell ausgelöst',
    'keyword_detected': 'Krisensignal in Nachricht erkannt',
    'inactivity': 'Ungewöhnliche Inaktivität'
  };
  return reasons[reason] || reason;
}

module.exports = {
  isSOS,
  isEmergencySetup,
  detectCrisis,
  triggerSOS,
  handleCrisisSignal,
  startEmergencySetup,
  parseAndSaveContact
};
