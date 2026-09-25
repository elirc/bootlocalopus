// The version every product starts with:
//
//   async function notify(user, message) {
//     if (user.phone) return sendSms(user.phone, message.text);
//     return sendEmail(user.email, message.text);
//   }
//
// Replace it with a notifier built from the patterns in this chapter.

export const DEFAULT_PREFERENCES = Object.freeze({
  channels: ['email'],
  quietHours: null,
  mutedTopics: [],
});

export function createNotifier({
  channels,
  getPreferences,
  clock = Date.now,
  dedupeWindowMs = 10 * 60 * 1000,
}) {
  return {
    on(type, listener) {
      throw new Error('TODO');
    },
    async notify(user, message) {
      throw new Error('TODO');
    },
  };
}
