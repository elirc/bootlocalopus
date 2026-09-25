export const DEFAULT_PREFERENCES = Object.freeze({
  channels: ['email'],
  quietHours: null,
  mutedTopics: [],
});

/** Is `hour` inside [start, end), where the range may wrap past midnight? */
function inQuietHours(quietHours, hour) {
  if (!quietHours) return false;
  const { start, end } = quietHours;
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function createNotifier({
  channels,
  getPreferences,
  clock = Date.now,
  dedupeWindowMs = 10 * 60 * 1000,
}) {
  // Strategy registry: the notifier never knows what an "sms" is.
  const registry = new Map();
  for (const channel of channels) {
    if (registry.has(channel.id)) throw new Error(`Duplicate channel "${channel.id}"`);
    registry.set(channel.id, channel);
  }

  // Observer: a tiny, failure-isolated event bus.
  const listeners = new Map();
  const emit = (type, payload) => {
    for (const listener of [...(listeners.get(type) ?? [])]) {
      try {
        listener(payload);
      } catch {
        // A broken audit logger must not change what was delivered.
      }
    }
  };

  const lastSentAt = new Map(); // `${userId}\u0000${key}` -> epoch ms
  const inFlight = new Set();

  const suppress = (userId, key, reason) => {
    emit('suppressed', { userId, key, reason });
    return { status: 'suppressed', reason };
  };

  return {
    on(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      const entry = (payload) => listener(payload);
      listeners.get(type).add(entry);
      return () => listeners.get(type).delete(entry);
    },

    async notify(user, message) {
      const { key, topic, urgent = false } = message;
      const prefs = { ...DEFAULT_PREFERENCES, ...(await getPreferences(user.id)) };

      // Everything from here to the reservation is synchronous, so two
      // concurrent calls cannot both pass the duplicate check.
      if (!urgent && prefs.mutedTopics.includes(topic)) return suppress(user.id, key, 'muted');
      if (!urgent && inQuietHours(prefs.quietHours, new Date(clock()).getUTCHours())) {
        return suppress(user.id, key, 'quiet-hours');
      }

      const dedupeKey = `${user.id}\u0000${key}`;
      const sentAt = lastSentAt.get(dedupeKey);
      if (inFlight.has(dedupeKey) || (sentAt !== undefined && clock() - sentAt < dedupeWindowMs)) {
        return suppress(user.id, key, 'duplicate');
      }
      inFlight.add(dedupeKey);

      const attempted = [];
      try {
        for (const id of prefs.channels) {
          const channel = registry.get(id);
          if (!channel || !channel.supports(user)) continue;
          attempted.push(id);
          try {
            await channel.send(user, message);
          } catch (error) {
            emit('failed', { userId: user.id, key, channel: id, error });
            continue;
          }
          lastSentAt.set(dedupeKey, clock());
          emit('sent', { userId: user.id, key, channel: id });
          return { status: 'sent', channel: id };
        }
      } finally {
        inFlight.delete(dedupeKey);
      }

      emit('undeliverable', { userId: user.id, key, attempted });
      return { status: 'undeliverable', attempted };
    },
  };
}
