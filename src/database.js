/**
 * SQLite Datenbank — Nutzerprofile, Konversationen, Erinnerungen
 */

const Database = require('better-sqlite3');
const path = require('path');

let db;

function initDatabase() {
  db = new Database(path.join(__dirname, '..', 'maia.db'));

  // WAL-Modus für bessere Performance
  db.pragma('journal_mode = WAL');

  db.exec(`
    -- Nutzerprofile
    CREATE TABLE IF NOT EXISTS users (
      phone TEXT PRIMARY KEY,
      name TEXT,
      current_module TEXT DEFAULT 'gesundheit',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Konversationshistorie
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      role TEXT NOT NULL,        -- 'user' oder 'assistant'
      content TEXT NOT NULL,
      module TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (phone) REFERENCES users(phone)
    );

    -- Erinnerungen
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      label TEXT NOT NULL,       -- z.B. "Blutdruck messen"
      remind_at DATETIME NOT NULL,
      recurring TEXT,            -- NULL, 'daily', 'weekly', 'monthly'
      sent INTEGER DEFAULT 0,   -- 0 = noch nicht gesendet
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (phone) REFERENCES users(phone)
    );

    -- Notfallkontakte (Vertrauenspersonen)
    CREATE TABLE IF NOT EXISTS emergency_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,           -- MAIA-Nutzer
      contact_phone TEXT NOT NULL,   -- Vertrauensperson (Sohn, Tochter, etc.)
      contact_name TEXT NOT NULL,    -- "Mein Sohn Thomas"
      relationship TEXT,             -- "Sohn", "Tochter", "Nachbar", etc.
      is_primary INTEGER DEFAULT 1,  -- Haupt-Notfallkontakt
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (phone) REFERENCES users(phone)
    );

    -- Notfall-Log
    CREATE TABLE IF NOT EXISTS emergency_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      trigger_type TEXT NOT NULL,    -- 'manual_sos', 'keyword_detected', 'inactivity'
      message_sent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Indizes
    CREATE INDEX IF NOT EXISTS idx_messages_phone_module
      ON messages(phone, module, created_at);
    CREATE INDEX IF NOT EXISTS idx_reminders_due
      ON reminders(remind_at, sent);
    CREATE INDEX IF NOT EXISTS idx_emergency_contacts_phone
      ON emergency_contacts(phone);
  `);
}

// ── Nutzer ───────────────────────────────────────────────

function getUser(phone) {
  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

  if (!user) {
    db.prepare(
      'INSERT INTO users (phone, current_module) VALUES (?, ?)'
    ).run(phone, 'gesundheit');
    user = { phone, currentModule: 'gesundheit', name: null };
  } else {
    user.currentModule = user.current_module;
  }

  // Last active aktualisieren
  db.prepare('UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE phone = ?').run(phone);

  return user;
}

function setUserModule(phone, moduleId) {
  getUser(phone); // Sicherstellen, dass der User existiert
  db.prepare('UPDATE users SET current_module = ? WHERE phone = ?').run(moduleId, phone);
}

// ── Nachrichten ──────────────────────────────────────────

function addMessage(phone, role, content, module) {
  db.prepare(
    'INSERT INTO messages (phone, role, content, module) VALUES (?, ?, ?, ?)'
  ).run(phone, role, content, module);
}

function getHistory(phone, module, limit = 10) {
  return db.prepare(`
    SELECT role, content FROM messages
    WHERE phone = ? AND module = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(phone, module, limit).reverse();
}

// ── Erinnerungen ─────────────────────────────────────────

function parseAndSaveReminder(phone, text) {
  // Einfaches Parsing: "Erinnere mich morgen um 9 Uhr an Blutdruck messen"
  // Oder: "Erinnerung: Arzttermin am 15.06. um 14:30"

  const now = new Date();

  // Versuche Zeitangaben zu extrahieren
  let remindAt = null;
  let label = text;
  let recurring = null;
  let displayTime = '';

  // "morgen um HH:MM" oder "morgen um H Uhr"
  const morgenMatch = text.match(/morgen\s+um\s+(\d{1,2})[:\s]?(\d{2})?\s*(uhr)?/i);
  if (morgenMatch) {
    const h = parseInt(morgenMatch[1]);
    const m = parseInt(morgenMatch[2] || '0');
    remindAt = new Date(now);
    remindAt.setDate(remindAt.getDate() + 1);
    remindAt.setHours(h, m, 0, 0);
    displayTime = `Morgen um ${h}:${String(m).padStart(2, '0')} Uhr`;
  }

  // "in X Stunden"
  const stundenMatch = text.match(/in\s+(\d+)\s+stunde/i);
  if (!remindAt && stundenMatch) {
    const hours = parseInt(stundenMatch[1]);
    remindAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
    displayTime = `In ${hours} Stunden`;
  }

  // "in X Minuten"
  const minutenMatch = text.match(/in\s+(\d+)\s+minute/i);
  if (!remindAt && minutenMatch) {
    const mins = parseInt(minutenMatch[1]);
    remindAt = new Date(now.getTime() + mins * 60 * 1000);
    displayTime = `In ${mins} Minuten`;
  }

  // "täglich um HH:MM"
  const taeglichMatch = text.match(/t[äa]glich\s+um\s+(\d{1,2})[:\s]?(\d{2})?\s*(uhr)?/i);
  if (taeglichMatch) {
    const h = parseInt(taeglichMatch[1]);
    const m = parseInt(taeglichMatch[2] || '0');
    remindAt = new Date(now);
    if (remindAt.getHours() > h || (remindAt.getHours() === h && remindAt.getMinutes() >= m)) {
      remindAt.setDate(remindAt.getDate() + 1);
    }
    remindAt.setHours(h, m, 0, 0);
    recurring = 'daily';
    displayTime = `Täglich um ${h}:${String(m).padStart(2, '0')} Uhr`;
  }

  // "am DD.MM. um HH:MM"
  const datumMatch = text.match(/am\s+(\d{1,2})\.(\d{1,2})\.?\s+um\s+(\d{1,2})[:\s]?(\d{2})?\s*(uhr)?/i);
  if (!remindAt && datumMatch) {
    const day = parseInt(datumMatch[1]);
    const month = parseInt(datumMatch[2]) - 1;
    const h = parseInt(datumMatch[3]);
    const m = parseInt(datumMatch[4] || '0');
    remindAt = new Date(now.getFullYear(), month, day, h, m, 0, 0);
    if (remindAt < now) remindAt.setFullYear(remindAt.getFullYear() + 1);
    displayTime = `${day}.${month + 1}. um ${h}:${String(m).padStart(2, '0')} Uhr`;
  }

  if (!remindAt) return null;

  // Label extrahieren: alles nach "an", "dass", ":"
  const labelMatch = text.match(/(?:an|dass|:)\s+(.+)$/i)
    || text.match(/erinner[^\s]*\s+(?:mich\s+)?(?:morgen|in|am|täglich)[^a-zäöü]*(?:uhr)?\s*(?:an\s+)?(.+)/i);

  if (labelMatch) {
    label = labelMatch[1] || labelMatch[2] || text;
  }
  label = label.replace(/^(erinner[^\s]*\s+(mich\s+)?)/i, '').trim();
  if (label.length < 3) label = text; // Fallback

  // In DB speichern
  db.prepare(
    'INSERT INTO reminders (phone, label, remind_at, recurring) VALUES (?, ?, ?, ?)'
  ).run(phone, label, remindAt.toISOString(), recurring);

  return { label, displayTime, recurring };
}

function getDueReminders() {
  const now = new Date().toISOString();
  return db.prepare(`
    SELECT * FROM reminders
    WHERE remind_at <= ? AND sent = 0
    ORDER BY remind_at
  `).all(now);
}

function markReminderSent(id) {
  db.prepare('UPDATE reminders SET sent = 1 WHERE id = ?').run(id);
}

function rescheduleRecurring(reminder) {
  const next = new Date(reminder.remind_at);

  switch (reminder.recurring) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      return;
  }

  db.prepare(
    'INSERT INTO reminders (phone, label, remind_at, recurring) VALUES (?, ?, ?, ?)'
  ).run(reminder.phone, reminder.label, next.toISOString(), reminder.recurring);
}

// ── Notfallkontakte ──────────────────────────────────────

function addEmergencyContact(phone, contactPhone, contactName, relationship) {
  // Prüfen ob der Kontakt schon existiert
  const existing = db.prepare(
    'SELECT id FROM emergency_contacts WHERE phone = ? AND contact_phone = ?'
  ).get(phone, contactPhone);

  if (existing) {
    // Aktualisieren
    db.prepare(
      'UPDATE emergency_contacts SET contact_name = ?, relationship = ? WHERE id = ?'
    ).run(contactName, relationship, existing.id);
    return { updated: true, id: existing.id };
  }

  // Wenn das der erste Kontakt ist → primary
  const count = db.prepare(
    'SELECT COUNT(*) as c FROM emergency_contacts WHERE phone = ?'
  ).get(phone).c;

  const result = db.prepare(
    'INSERT INTO emergency_contacts (phone, contact_phone, contact_name, relationship, is_primary) VALUES (?, ?, ?, ?, ?)'
  ).run(phone, contactPhone, contactName, relationship, count === 0 ? 1 : 0);

  return { updated: false, id: result.lastInsertRowid };
}

function getEmergencyContacts(phone) {
  return db.prepare(
    'SELECT * FROM emergency_contacts WHERE phone = ? ORDER BY is_primary DESC'
  ).all(phone);
}

function getPrimaryEmergencyContact(phone) {
  return db.prepare(
    'SELECT * FROM emergency_contacts WHERE phone = ? AND is_primary = 1'
  ).get(phone);
}

function removeEmergencyContact(phone, contactPhone) {
  db.prepare(
    'DELETE FROM emergency_contacts WHERE phone = ? AND contact_phone = ?'
  ).run(phone, contactPhone);
}

function logEmergency(phone, contactPhone, triggerType, messageSent) {
  db.prepare(
    'INSERT INTO emergency_log (phone, contact_phone, trigger_type, message_sent) VALUES (?, ?, ?, ?)'
  ).run(phone, contactPhone, triggerType, messageSent);
}

function getRecentMessages(phone, limit = 5) {
  return db.prepare(`
    SELECT role, content, module, created_at FROM messages
    WHERE phone = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(phone, limit).reverse();
}

module.exports = {
  initDatabase,
  getUser,
  setUserModule,
  addMessage,
  getHistory,
  parseAndSaveReminder,
  getDueReminders,
  markReminderSent,
  rescheduleRecurring,
  addEmergencyContact,
  getEmergencyContacts,
  getPrimaryEmergencyContact,
  removeEmergencyContact,
  logEmergency,
  getRecentMessages
};
