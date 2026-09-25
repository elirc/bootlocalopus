// A first attempt: no expiry, no prefix, and every failure is thrown.
export function createStore({ storage, prefix, now = Date.now }) {
  return {
    set(key, value, { ttlMs } = {}) {
      storage.setItem(key, JSON.stringify(value));
      return true;
    },
    get(key) {
      return JSON.parse(storage.getItem(key));
    },
    remove(key) {
      storage.removeItem(key);
    },
    clearExpired() {
      throw new Error('not implemented');
    },
  };
}
