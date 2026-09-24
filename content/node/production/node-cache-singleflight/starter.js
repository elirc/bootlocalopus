export function createCache({ max = 100, ttlMs = 60_000, now = Date.now } = {}) {
  const entries = new Map();   // key -> { value, storedAt }
  const inflight = new Map();  // key -> promise of the pending load

  return {
    // TODO: fresh hit, single-flight miss, never cache a rejection, TTL, LRU.
    // Right now every call goes straight to the loader: no cache at all.
    async getOrLoad(key, loader) {
      return loader(key);
    },

    delete(key) {
      // TODO
    },

    get size() {
      return entries.size;
    },
  };
}
