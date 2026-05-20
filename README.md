# MAIA WhatsApp Bot

**AI-Assistent für Menschen ab 60** — powered by Claude AI & AI Pioneer

MAIA läuft als WhatsApp-Chatbot und bietet 5 Module: Gesundheit, Recht, Fitness, Finanzen und Lebensberatung. Nutzer können Fotos von Arztbriefen oder Dokumenten schicken und Erinnerungen setzen.

---

## Setup-Anleitung (Schritt für Schritt)

### 1. Meta Business Account einrichten

1. Gehe zu **[business.facebook.com](https://business.facebook.com)** und erstelle ein Business-Konto (oder nutze ein bestehendes).

2. Gehe zu **[developers.facebook.com](https://developers.facebook.com)** und erstelle eine neue App:
   - Typ: **"Business"**
   - Name: **"MAIA WhatsApp Bot"**
   - Verbinde sie mit deinem Business-Konto

3. Füge das Produkt **"WhatsApp"** hinzu → "Einrichten"

4. Im WhatsApp-Dashboard bekommst du:
   - **Phone Number ID** → das ist deine `WHATSAPP_PHONE_ID`
   - **Temporary Token** → zum Testen (läuft nach 24h ab)

5. Notiere dir auch das **App Secret** unter "App Settings" → "Basic" → `META_APP_SECRET`

### 2. Deutsche Telefonnummer registrieren

1. Im WhatsApp-Dashboard → "Getting Started" → "Add phone number"
2. Wähle **"Use your own number"**
3. Gib eine deutsche Nummer ein (z.B. eine neue Prepaid-SIM)
4. Verifiziere per SMS oder Anruf
5. Erstelle ein **Business-Profil**:
   - Name: **MAIA — Ihr AI-Assistent**
   - Kategorie: **Health & Wellness** (oder **Education**)
   - Beschreibung: *"Ihr persönlicher AI-Assistent für Gesundheit, Recht, Fitness, Finanzen und Lebensberatung."*

### 3. Permanenten Token erstellen

Der temporäre Token läuft ab. Für Production brauchst du einen System-User-Token:

1. Gehe zu **business.facebook.com** → Einstellungen → "System Users"
2. Erstelle einen neuen System User (Admin-Rolle)
3. Klicke "Generate Token" → wähle deine WhatsApp-App
4. Berechtigungen: `whatsapp_business_messaging`, `whatsapp_business_management`
5. Kopiere den Token → das ist dein `WHATSAPP_TOKEN`

### 4. Railway Deployment

1. **Account erstellen**: [railway.app](https://railway.app) (GitHub-Login)

2. **Neues Projekt** → "Deploy from GitHub Repo" (oder manuell):
   ```bash
   # Falls du das Repo auf GitHub pushst:
   git init
   git add .
   git commit -m "MAIA WhatsApp Bot v1.0"
   git remote add origin https://github.com/DEIN-USER/maia-whatsapp-bot.git
   git push -u origin main
   ```

3. **Environment Variables** in Railway setzen:
   ```
   WHATSAPP_TOKEN=dein-system-user-token
   WHATSAPP_PHONE_ID=deine-phone-number-id
   WHATSAPP_VERIFY_TOKEN=maia-webhook-2024
   META_APP_SECRET=dein-app-secret
   ANTHROPIC_API_KEY=sk-ant-dein-key
   PORT=3000
   NODE_ENV=production
   ```

4. **Deployment starten** — Railway baut automatisch

5. **Domain notieren**: Railway gibt dir eine URL wie `maia-bot-production.up.railway.app`

### 5. Webhook verbinden

1. Gehe zurück zu **developers.facebook.com** → WhatsApp → Configuration
2. Klicke "Edit" bei Webhook
3. **Callback URL**: `https://deine-railway-url.up.railway.app/webhook`
4. **Verify Token**: `maia-webhook-2024` (muss mit `WHATSAPP_VERIFY_TOKEN` übereinstimmen)
5. Klicke "Verify and Save"
6. **Subscribe** to: `messages` (Häkchen setzen)

### 6. Testen

1. Öffne WhatsApp auf deinem Handy
2. Schreibe eine Nachricht an die MAIA-Nummer
3. Schreibe **"Hallo"** → du solltest das Modul-Menü bekommen
4. Wähle **"1"** für Gesundheit
5. Stelle eine Frage → MAIA antwortet!

---

## Nutzung

| Befehl | Was passiert |
|--------|-------------|
| **Hallo** / **Menü** / **Start** | Modul-Auswahl anzeigen |
| **1–5** | Modul wechseln |
| Einfach schreiben | MAIA antwortet im aktuellen Modul |
| Foto schicken | MAIA analysiert das Dokument (Arztbrief, Bescheid...) |
| **Erinnere mich morgen um 9 Uhr an Blutdruck messen** | Erinnerung setzen |
| **Erinnere mich täglich um 8 Uhr an Medikamente nehmen** | Wiederkehrende Erinnerung |

---

## Architektur

```
WhatsApp User
    ↓ Nachricht
Meta Cloud API
    ↓ Webhook POST
Node.js/Express (Railway)
    ├── messageHandler.js  → Routing & Orchestrierung
    ├── modules.js         → 5 Module mit System-Prompts
    ├── claude.js          → Anthropic API (Text + Vision)
    ├── database.js        → SQLite (User, History, Reminders)
    ├── reminders.js       → Cron-Job für Erinnerungen
    └── whatsapp.js        → Meta Graph API (Senden)
    ↓ Antwort
Meta Cloud API
    ↓
WhatsApp User
```

---

## Kosten-Übersicht

| Posten | Kosten |
|--------|--------|
| Meta WhatsApp API | ~0,03–0,06 € pro 24h-Konversation |
| Erste 1.000 Konversationen/Monat | **kostenlos** |
| Claude API (Sonnet) | ~0,005 € pro Nachricht |
| Railway Hosting | $5 Free Credit/Monat |
| **Gesamt pro aktivem Nutzer** | **~3–5 €/Monat** |

---

## Dateien

```
maia-whatsapp-bot/
├── src/
│   ├── index.js          # Express Server + Webhook
│   ├── messageHandler.js # Nachrichten-Verarbeitung
│   ├── modules.js        # 5 MAIA-Module
│   ├── claude.js         # Claude API (Text + Vision)
│   ├── whatsapp.js       # WhatsApp Cloud API
│   ├── database.js       # SQLite DB
│   └── reminders.js      # Erinnerungs-Cron
├── .env.example          # Environment-Vorlage
├── .gitignore
├── Dockerfile
├── railway.toml
├── package.json
└── README.md
```

---

*AI Pioneer — MAIA v1.0*
# Build trigger Wed May 20 09:58:54 CEST 2026
