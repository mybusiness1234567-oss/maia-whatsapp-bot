/**
 * Erinnerungs-System — Cron-Job prüft jede Minute auf fällige Erinnerungen
 */

const cron = require('node-cron');
const { getDueReminders, markReminderSent, rescheduleRecurring } = require('./database');
const { sendTextMessage } = require('./whatsapp');

function startReminderCron() {
  // Jede Minute prüfen
  cron.schedule('* * * * *', async () => {
    const due = getDueReminders();

    for (const reminder of due) {
      try {
        // Erinnerung senden
        await sendTextMessage(reminder.phone,
          `🔔 *Erinnerung*\n\n` +
          `${reminder.label}\n\n` +
          `_Gesendet von MAIA — Ihrem persönlichen Assistenten._`
        );

        // Als gesendet markieren
        markReminderSent(reminder.id);

        // Wiederkehrende Erinnerung neu planen
        if (reminder.recurring) {
          rescheduleRecurring(reminder);
        }

        console.log(`[Reminder] Gesendet an ${reminder.phone}: ${reminder.label}`);

      } catch (err) {
        console.error(`[Reminder] Fehler bei ${reminder.phone}:`, err.message);
      }
    }
  });
}

module.exports = { startReminderCron };
