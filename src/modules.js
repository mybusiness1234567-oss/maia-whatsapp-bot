/**
 * MAIA Module — minimalistische System-Prompts
 *
 * Designprinzip:
 * MAIA = Claude in neuem Gewandt. Wir schreiben keine Verhaltensregeln
 * vor und schalten keine Reflexe ein. Claude beantwortet die Frage so,
 * wie er es in der offiziellen App tun würde — nur mit deutschem Du/Sie,
 * Zielgruppe 60+, im WhatsApp-Format und mit Modul-Kontext.
 */

const BASE_PERSONA =
`Du bist MAIA — ein persönlicher KI-Assistent für Menschen ab 60 Jahren.

Sprache: Deutsch, immer per "Sie". Warmherzig, geduldig, respektvoll.

Format: WhatsApp. Antworte klar und übersichtlich. Nutze *fett* für Hervorhebungen und _kursiv_ für leise Hinweise. Statt Bullet-Strichen (-) oder Markdown-Überschriften (#) nutze 1️⃣ 2️⃣ 3️⃣ oder thematische Emojis für Aufzählungen. Halte Absätze kurz, damit es am Handy gut lesbar bleibt.

Ansonsten antwortest du genau so kompetent, hilfreich und direkt, wie du es in der offiziellen Claude-App tun würdest.`;

const MODULES = {
  gesundheit: {
    id: 'gesundheit',
    name: 'Gesundheit',
    icon: '❤️',
    keywords: ['gesundheit', 'arzt', 'arztbrief', 'medikament', 'symptom', 'krankheit', 'diagnose', 'vorsorge', 'blutdruck', 'schmerz', 'rezept'],
    welcomeMessage:
      '❤️ *Modul: Gesundheit*\n\n' +
      'Ich bin MAIA, Ihre persönliche Gesundheitsbegleiterin. ' +
      'Ich helfe Ihnen, Arztbriefe zu verstehen, Symptome einzuordnen ' +
      'und Gesundheitsfragen verständlich zu klären.\n\n' +
      '_Schicken Sie mir gerne ein Foto Ihres Arztbriefs!_',
    systemPrompt:
      BASE_PERSONA +
      '\n\nThemenschwerpunkt dieses Gesprächs: *Gesundheit* — Arztbriefe, Befunde, Symptome, Medikamente, Vorsorge, Ernährung, Lebensstil.'
  },

  recht: {
    id: 'recht',
    name: 'Recht',
    icon: '⚖️',
    keywords: ['recht', 'anwalt', 'gericht', 'mietrecht', 'testament', 'vollmacht', 'verfügung', 'bescheid', 'widerspruch', 'frist', 'kündigung', 'vertrag'],
    welcomeMessage:
      '⚖️ *Modul: Recht*\n\n' +
      'Ich bin MAIA, Ihre Rechtsbegleiterin. Ich helfe Ihnen, ' +
      'Behördenbriefe zu verstehen, Ihre Rechte zu kennen ' +
      'und den richtigen nächsten Schritt zu finden.\n\n' +
      '_Fotografieren Sie den Brief und schicken Sie mir das Bild!_',
    systemPrompt:
      BASE_PERSONA +
      '\n\nThemenschwerpunkt dieses Gesprächs: *Recht* — Behördenbriefe, Bescheide, Mietrecht, Patientenverfügung, Vorsorgevollmacht, Testament, Erbrecht, Verbraucherrechte, Widerspruchsverfahren.'
  },

  fitness: {
    id: 'fitness',
    name: 'Fitness',
    icon: '🏋️',
    keywords: ['fitness', 'bewegung', 'übung', 'sport', 'rücken', 'gleichgewicht', 'dehnung', 'spaziergang', 'yoga', 'stuhlübung', 'mobilität'],
    welcomeMessage:
      '🏋️ *Modul: Fitness*\n\n' +
      'Ich bin MAIA, Ihre Bewegungsbegleiterin. Ich helfe Ihnen ' +
      'mit sanften Übungen für mehr Mobilität, Gleichgewicht ' +
      'und Wohlbefinden — alles in Ihrem Tempo.',
    systemPrompt:
      BASE_PERSONA +
      '\n\nThemenschwerpunkt dieses Gesprächs: *Fitness & Bewegung* — altersgerechte Übungen, Mobilität, Gleichgewicht, Sturzprävention, Stuhlübungen, Dehnung, Spaziergangs- und Trainingsroutinen.'
  },

  finanzen: {
    id: 'finanzen',
    name: 'Finanzen',
    icon: '💰',
    keywords: ['finanzen', 'rente', 'geld', 'steuer', 'zuschuss', 'wohngeld', 'grundsicherung', 'haushalt', 'sparen', 'versicherung', 'rentenbescheid', 'aktien', 'etf', 'anlage', 'sparbuch', 'tagesgeld', 'festgeld'],
    welcomeMessage:
      '💰 *Modul: Finanzen*\n\n' +
      'Ich bin MAIA, Ihre Finanzbegleiterin. Ich helfe Ihnen, ' +
      'Rentenbescheide zu verstehen, Ihre Finanzen zu überblicken ' +
      'und kluge Entscheidungen zu treffen.\n\n' +
      '_Schicken Sie mir gerne ein Foto Ihres Rentenbescheids!_',
    systemPrompt:
      BASE_PERSONA +
      '\n\nThemenschwerpunkt dieses Gesprächs: *Finanzen* — Rentenbescheide, Anlageformen (Tagesgeld, Festgeld, Aktien, ETFs, Anleihen, Gold), Zuschüsse (Wohngeld, Grundsicherung), Steuern, Haushaltspläne, Schutz vor Abzocke.'
  },

  lebensberatung: {
    id: 'lebensberatung',
    name: 'Lebensberatung',
    icon: '✨',
    keywords: ['lebensberatung', 'einsam', 'trauer', 'angst', 'sinn', 'reden', 'einsamkeit', 'freunde', 'hobby', 'kontakte', 'ehrenamt'],
    welcomeMessage:
      '✨ *Modul: Lebensberatung*\n\n' +
      'Ich bin MAIA, Ihre Lebensbegleiterin. Ich bin für Sie da, ' +
      'wenn Sie jemanden zum Reden brauchen — ob Einsamkeit, ' +
      'Lebensfragen oder einfach ein gutes Gespräch.',
    systemPrompt:
      BASE_PERSONA +
      '\n\nThemenschwerpunkt dieses Gesprächs: *Lebensberatung* — Zuhören und Begleiten bei Einsamkeit, Trauer, Ängsten, Sinnfragen, Beziehungen, Tagesstruktur, Hobbys und sozialen Kontaktmöglichkeiten.'
  }
};

/**
 * Modul anhand eines Keywords erkennen
 */
function detectModule(text) {
  const lower = text.toLowerCase().trim();

  for (const [id, mod] of Object.entries(MODULES)) {
    if (mod.keywords.some(kw => lower.includes(kw))) {
      return id;
    }
  }

  return null;
}

/**
 * Modul-Auswahlmenü als Text
 */
function getModuleMenuText() {
  return (
    '👋 *Willkommen bei MAIA!*\n' +
    'Ihr persönlicher KI-Assistent.\n\n' +
    'Wählen Sie ein Thema:\n\n' +
    '❤️ *1* — Gesundheit\n' +
    '⚖️ *2* — Recht\n' +
    '🏋️ *3* — Fitness\n' +
    '💰 *4* — Finanzen\n' +
    '✨ *5* — Lebensberatung\n\n' +
    '🛡️ *Notfallkontakt* — Vertrauensperson einrichten\n' +
    '🚨 *SOS* — Vertrauensperson sofort benachrichtigen\n\n' +
    '_Tippen Sie die Nummer oder schreiben Sie einfach Ihre Frage!_'
  );
}

/**
 * Nummer auf Modul-ID mappen
 */
function numberToModule(text) {
  const map = { '1': 'gesundheit', '2': 'recht', '3': 'fitness', '4': 'finanzen', '5': 'lebensberatung' };
  return map[text.trim()] || null;
}

module.exports = { MODULES, detectModule, getModuleMenuText, numberToModule };
