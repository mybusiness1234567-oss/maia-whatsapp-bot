/**
 * Claude API Integration
 * Text- und Vision-Anfragen an die Anthropic API
 */

const Anthropic = require('@anthropic-ai/sdk').default;
const { MODULES } = require('./modules');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const MODEL = 'claude-opus-4-6';
const MAX_TOKENS = 800;

/**
 * Text-Anfrage an Claude
 */
async function callClaude(moduleId, history) {
  const mod = MODULES[moduleId];

  const messages = history.map(msg => ({
    role: msg.role,
    content: msg.content
  }));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: mod.systemPrompt,
    messages: messages
  });

  return response.content[0].text;
}

/**
 * Bild + Text an Claude (Vision)
 */
async function callClaudeWithImage(moduleId, imageBuffer, mimeType, userText) {
  const mod = MODULES[moduleId];

  // Unterstützte MIME-Types für Claude Vision
  const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const mediaType = supportedTypes.includes(mimeType) ? mimeType : 'image/jpeg';

  const base64Image = imageBuffer.toString('base64');

  const visionPrompt =
    mod.systemPrompt + '\n\n' +
    'ZUSATZ FÜR BILDANALYSE:\n' +
    'Der Nutzer hat Ihnen ein Foto geschickt. Analysieren Sie das Bild sorgfältig. ' +
    'Wenn es ein Dokument ist (Arztbrief, Bescheid, Rechnung), erklären Sie den Inhalt ' +
    'Schritt für Schritt in einfacher Sprache. Heben Sie die wichtigsten Punkte hervor ' +
    'und empfehlen Sie nächste Schritte.';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: visionPrompt,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64Image
          }
        },
        {
          type: 'text',
          text: userText
        }
      ]
    }]
  });

  return response.content[0].text;
}

module.exports = { callClaude, callClaudeWithImage };
