export function createCache({ max = 100, ttlMs = 60_000, now = Date.now } = {}) {
  // key -> { value, storedAt }. A Map iterates in insertion order, so
  // "delete then set" moves a key to the most-recently-used end.
  const entries = new Map();
  // key -> the promise of the load currently in flight for it.
  const inflight = new Map();

  const isFresh = (entry) => now() - entry.storedAt < ttlMs;

  const touch = (key, entry) => {
    entries.delete(key);
    entries.set(key, entry);
  };

  const store = (key, value) => {
    touch(key, { value, storedAt: now() });
    while (entries.size > max) {
      // The first key in iteration order is the least recently used.
      entries.delete(entries.keys().next().value);
    }
  };

  return {
    getOrLoad(key, loader) {
      const entry = entries.get(key);
      if (entry && isFresh(entry)) {
        touch(key, entry);
        return Promise.resolve(entry.value);
      }
      if (entry) entries.delete(key); // stale

      const pending = inflight.get(key);
      if (pending) return pending;

      // `new Promise` turns a synchronous throw in the loader into a rejection.
      const load = new Promise((resolve) => resolve(loader(key))).then(
        (value) => {
          // Only the load that is still current may write. A delete() or a
          // newer load replaced us in `inflight`, and our result is stale.
          if (inflight.get(key) === load) {
            inflight.delete(key);
            store(key, value);
          }
          return value;
        },
        (error) => {
          if (inflight.get(key) === load) inflight.delete(key);
          throw error;
        },
      );
      inflight.set(key, load);
      return load;
    },

    delete(key) {
      entries.delete(key);
      inflight.delete(key);
    },

    get size() {
      return entries.size;
    },
  };
}
