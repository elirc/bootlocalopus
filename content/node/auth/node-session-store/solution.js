import crypto from 'node:crypto';

export function createSessionStore({ idleMs = 1_800_000, absoluteMs = 43_200_000, now = Date.now } = {}) {
  const sessions = new Map(); // sid -> { userId, data, createdAt, lastSeenAt }
  const byUser = new Map(); // userId -> Set<sid>

  const newId = () => crypto.randomBytes(24).toString('base64url');

  const index = (userId, sid) => {
    let set = byUser.get(userId);
    if (!set) byUser.set(userId, (set = new Set()));
    set.add(sid);
  };

  const remove = (sid) => {
    const session = sessions.get(sid);
    if (!session) return;
    sessions.delete(sid);
    const set = byUser.get(session.userId);
    set?.delete(sid);
    if (set?.size === 0) byUser.delete(session.userId);
  };

  const isExpired = (s, t) => t - s.lastSeenAt >= idleMs || t - s.createdAt >= absoluteMs;

  /** The live session for `sid`, or undefined. Expired sessions are removed on sight. */
  const live = (sid) => {
    if (typeof sid !== 'string') return undefined;
    const session = sessions.get(sid);
    if (!session) return undefined;
    if (isExpired(session, now())) {
      remove(sid);
      return undefined;
    }
    return session;
  };

  const view = (s) => ({ userId: s.userId, data: s.data, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt });

  return {
    create(userId, data = {}) {
      const sid = newId();
      const t = now();
      sessions.set(sid, { userId, data, createdAt: t, lastSeenAt: t });
      index(userId, sid);
      return sid;
    },

    get(sid) {
      const session = live(sid);
      if (!session) return null;
      session.lastSeenAt = now();
      return view(session);
    },

    rotate(sid) {
      const session = live(sid);
      if (!session) return null;
      remove(sid);
      const next = newId();
      // Same session, new name. createdAt is kept so the absolute timeout still holds.
      sessions.set(next, { ...session, lastSeenAt: now() });
      index(session.userId, next);
      return next;
    },

    destroy(sid) {
      if (!live(sid)) return false;
      remove(sid);
      return true;
    },

    destroyAllForUser(userId, { except } = {}) {
      let removed = 0;
      for (const sid of [...(byUser.get(userId) ?? [])]) {
        if (sid === except) continue;
        if (live(sid)) removed++; // live() already removed it if it was expired
        remove(sid);
      }
      return removed;
    },

    countForUser(userId) {
      let count = 0;
      for (const sid of [...(byUser.get(userId) ?? [])]) if (live(sid)) count++;
      return count;
    },

    sweep() {
      const t = now();
      let removed = 0;
      for (const [sid, session] of sessions) {
        if (isExpired(session, t)) {
          remove(sid);
          removed++;
        }
      }
      return removed;
    },
  };
}
