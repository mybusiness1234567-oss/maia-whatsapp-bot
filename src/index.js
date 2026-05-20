/**
 * MAIA WhatsApp Bot — Hauptserver
 * AI Pioneer | https://www.ghost-code.net
 *
 * Empfängt WhatsApp-Nachrichten via Meta Webhook,
 * verarbeitet sie mit Claude AI und antwortet dem Nutzer.
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const crypto = require('crypto');

const { handleIncomingMessage } = require('./messageHandler');
const { initDatabase } = require('./database');
const { startReminderCron } = require('./reminders');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────
app.use(helmet());
app.use(morgan('short'));

// Raw body für Signatur-Verifizierung speichern
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));

// ── Health Check ─────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: 'MAIA WhatsApp Bot',
    status: 'running',
    version: '1.0.0',
    by: 'AI Pioneer'
  });
});

// ── Webhook Verification (GET) ───────────────────────────
// Meta sendet einen GET-Request um den Webhook zu verifizieren.
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[Webhook] Verifizierung erfolgreich');
    return res.status(200).send(challenge);
  }

  console.warn('[Webhook] Verifizierung fehlgeschlagen');
  return res.sendStatus(403);
});

// ── Webhook Messages (POST) ──────────────────────────────
// Meta sendet eingehende Nachrichten hierher.
app.post('/webhook', async (req, res) => {
  // Sofort 200 zurückgeben (Meta erwartet schnelle Antwort)
  res.sendStatus(200);

  // Signatur prüfen
  if (!verifySignature(req)) {
    console.warn('[Webhook] Ungültige Signatur — Nachricht ignoriert');
    return;
  }

  try {
    const body = req.body;

    // Nur WhatsApp-Nachrichten verarbeiten
    if (body.object !== 'whatsapp_business_account') return;

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const messages = value.messages || [];

        for (const message of messages) {
          await handleIncomingMessage(message, value.metadata);
        }
      }
    }
  } catch (err) {
    console.error('[Webhook] Fehler:', err.message);
  }
});

// ── Signatur-Verifizierung ───────────────────────────────
function verifySignature(req) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // Skip in Development

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(req.rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// ── Server Start ─────────────────────────────────────────
async function start() {
  // Datenbank initialisieren
  initDatabase();
  console.log('[DB] SQLite initialisiert');

  // Erinnerungs-Cron starten
  startReminderCron();
  console.log('[Cron] Erinnerungs-Check läuft');

  app.listen(PORT, () => {
    console.log(`\n🟢 MAIA WhatsApp Bot läuft auf Port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/`);
    console.log(`   Webhook: http://localhost:${PORT}/webhook\n`);
  });
}

start().catch(err => {
  console.error('Start fehlgeschlagen:', err);
  process.exit(1);
});
