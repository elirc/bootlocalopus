export class LimitError extends Error {
  constructor(code) {
    super(code);
    this.name = 'LimitError';
    this.code = code;
  }
}

const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

export function createUserLimits({ maxInFlight = 2, bytesPerDay = 104_857_600, now = Date.now } = {}) {
  // userId -> { inFlight, reserved, day, used }. Only the current day's usage is kept.
  const users = new Map();

  const stateOf = (userId) => {
    let s = users.get(userId);
    if (!s) users.set(userId, (s = { inFlight: 0, reserved: 0, day: dayOf(now()), used: 0 }));
    return s;
  };

  /** Usage for the current UTC day, rolling over (and forgetting yesterday) when needed. */
  const usedToday = (s) => {
    const today = dayOf(now());
    if (s.day !== today) {
      s.day = today;
      s.used = 0;
    }
    return s.used;
  };

  return {
    acquire(userId, bytes) {
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new LimitError('invalid-size');
      const s = stateOf(userId);
      if (s.inFlight >= maxInFlight) throw new LimitError('too-many-in-flight');
      // Reserved bytes count: they are uploads that have been promised room.
      if (usedToday(s) + s.reserved + bytes > bytesPerDay) throw new LimitError('quota-exceeded');

      s.inFlight++;
      s.reserved += bytes;
      const day = s.day;
      let released = false;

      return function release(ok = true) {
        if (released) return false;
        released = true;
        s.inFlight--;
        s.reserved -= bytes;
        if (ok) {
          usedToday(s); // roll over first if the day has changed
          // Charge the day the upload started. If that day is over, its usage is gone anyway.
          if (s.day === day) s.used += bytes;
        }
        return true;
      };
    },

    usage(userId) {
      const s = users.get(userId);
      if (!s) return { inFlight: 0, reserved: 0, usedToday: 0, remaining: bytesPerDay };
      const used = usedToday(s);
      return { inFlight: s.inFlight, reserved: s.reserved, usedToday: used, remaining: Math.max(0, bytesPerDay - used - s.reserved) };
    },
  };
}
