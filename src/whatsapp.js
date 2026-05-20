/**
 * WhatsApp Cloud API — Senden von Nachrichten
 */

const axios = require('axios');

const API_URL = 'https://graph.facebook.com/v21.0';

/**
 * Text-Nachricht an eine WhatsApp-Nummer senden
 */
async function sendTextMessage(to, text) {
  // WhatsApp hat ein 4096-Zeichen-Limit pro Nachricht
  const chunks = splitMessage(text, 4000);

  for (const chunk of chunks) {
    await callWhatsAppAPI(to, {
      type: 'text',
      text: { body: chunk }
    });
  }
}

/**
 * Interaktives Menü senden (z.B. Modul-Auswahl)
 */
async function sendButtonMessage(to, bodyText, buttons) {
  await callWhatsAppAPI(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map((btn, i) => ({
          type: 'reply',
          reply: {
            id: btn.id,
            title: btn.title.substring(0, 20) // Max 20 Zeichen
          }
        }))
      }
    }
  });
}

/**
 * Listen-Menü senden (für Modul-Auswahl mit 5 Optionen)
 */
async function sendListMessage(to, bodyText, buttonText, sections) {
  await callWhatsAppAPI(to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonText.substring(0, 20),
        sections: sections
      }
    }
  });
}

/**
 * Reaktion senden (Emoji auf eine Nachricht)
 */
async function sendReaction(to, messageId, emoji) {
  await callWhatsAppAPI(to, {
    type: 'reaction',
    reaction: {
      message_id: messageId,
      emoji: emoji
    }
  });
}

/**
 * "Typing..." Status anzeigen
 */
async function markAsRead(messageId) {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_TOKEN;

  try {
    await axios.post(`${API_URL}/${phoneId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (err) {
    // Nicht kritisch — ignorieren
  }
}

/**
 * Bild von WhatsApp herunterladen (für Vision-Analyse)
 */
async function downloadMedia(mediaId) {
  const token = process.env.WHATSAPP_TOKEN;

  // Schritt 1: Media-URL abrufen
  const { data: mediaInfo } = await axios.get(
    `${API_URL}/${mediaId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  // Schritt 2: Binärdaten herunterladen
  const { data: imageBuffer } = await axios.get(mediaInfo.url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer'
  });

  return {
    buffer: Buffer.from(imageBuffer),
    mimeType: mediaInfo.mime_type
  };
}

// ── Hilfsfunktionen ──────────────────────────────────────

async function callWhatsAppAPI(to, messageContent) {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_TOKEN;

  try {
    const response = await axios.post(`${API_URL}/${phoneId}/messages`, {
      messaging_product: 'whatsapp',
      to: to,
      ...messageContent
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (err) {
    const errorData = err.response?.data?.error || {};
    console.error('[WhatsApp API] Fehler:', errorData.message || err.message);
    throw err;
  }
}

function splitMessage(text, maxLength) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Am letzten Absatz oder Satzende vor maxLength trennen
    let splitAt = remaining.lastIndexOf('\n\n', maxLength);
    if (splitAt < maxLength * 0.3) {
      splitAt = remaining.lastIndexOf('. ', maxLength);
    }
    if (splitAt < maxLength * 0.3) {
      splitAt = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitAt < 1) splitAt = maxLength;

    chunks.push(remaining.substring(0, splitAt + 1).trim());
    remaining = remaining.substring(splitAt + 1).trim();
  }

  return chunks;
}

module.exports = {
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  sendReaction,
  markAsRead,
  downloadMedia
};
