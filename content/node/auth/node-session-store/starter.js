import crypto from 'node:crypto';

export function createSessionStore({ idleMs = 1_800_000, absoluteMs = 43_200_000, now = Date.now } = {}) {
  const sessions = {}; // sid -> session

  return {
    create(userId, data = {}) {
      // TODO: a random id, not a counter.
      const sid = String(Object.keys(sessions).length + 1);
      sessions[sid] = { userId, data, createdAt: now(), lastSeenAt: now() };
      return sid;
    },

    get(sid) {
      // TODO: idle and absolute expiry; a get is activity.
      return sessions[sid] ?? null;
    },

    rotate(sid) {
      throw new Error('not implemented');
    },

    destroy(sid) {
      throw new Error('not implemented');
    },

    destroyAllForUser(userId, { except } = {}) {
      throw new Error('not implemented');
    },

    countForUser(userId) {
      throw new Error('not implemented');
    },

    sweep() {
      throw new Error('not implemented');
    },
  };
}
