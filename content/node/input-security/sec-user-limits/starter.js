export class LimitError extends Error {
  constructor(code) {
    super(code);
    this.name = 'LimitError';
    this.code = code;
  }
}

export function createUserLimits({ maxInFlight = 2, bytesPerDay = 104_857_600, now = Date.now } = {}) {
  const inFlight = new Map();
  const used = new Map();

  return {
    acquire(userId, bytes) {
      // Two of the bugs from the brief live here: only finished bytes are
      // counted, and release can be called any number of times.
      if ((inFlight.get(userId) ?? 0) >= maxInFlight) throw new LimitError('too-many-in-flight');
      if ((used.get(userId) ?? 0) + bytes > bytesPerDay) throw new LimitError('quota-exceeded');
      inFlight.set(userId, (inFlight.get(userId) ?? 0) + 1);
      return (ok = true) => {
        inFlight.set(userId, inFlight.get(userId) - 1);
        if (ok) used.set(userId, (used.get(userId) ?? 0) + bytes);
        return true;
      };
    },

    usage(userId) {
      throw new Error('not implemented');
    },
  };
}
