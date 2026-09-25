const QUOTA_ERRORS = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);
const isQuotaError = (error) => QUOTA_ERRORS.has(error?.name);

export function createStore({ storage, prefix, now = Date.now }) {
  /** Parses a raw entry; `undefined` when it is not one of ours. */
  function decode(raw) {
    if (raw === null) return undefined;
    try {
      const entry = JSON.parse(raw);
      const valid = entry !== null && typeof entry === 'object' && 'v' in entry
        && (entry.e === null || Number.isFinite(entry.e));
      return valid ? entry : undefined;
    } catch {
      return undefined;
    }
  }

  const isLive = (entry) => entry !== undefined && (entry.e === null || now() < entry.e);

  function clearExpired() {
    // Collect first: removing while walking key(i) shifts the indexes.
    const ours = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null && key.startsWith(prefix)) ours.push(key);
    }
    let removed = 0;
    for (const key of ours) {
      if (!isLive(decode(storage.getItem(key)))) {
        storage.removeItem(key);
        removed++;
      }
    }
    return removed;
  }

  function set(key, value, { ttlMs } = {}) {
    const raw = JSON.stringify({ v: value, e: ttlMs === undefined ? null : now() + ttlMs });
    try {
      storage.setItem(prefix + key, raw);
      return true;
    } catch (error) {
      if (!isQuotaError(error)) throw error;
    }
    clearExpired();
    try {
      storage.setItem(prefix + key, raw);
      return true;
    } catch (error) {
      if (isQuotaError(error)) return false;
      throw error;
    }
  }

  function get(key) {
    const entry = decode(storage.getItem(prefix + key));
    if (isLive(entry)) return entry.v;
    storage.removeItem(prefix + key); // expired or unreadable: clean it up
    return null;
  }

  function remove(key) {
    storage.removeItem(prefix + key);
  }

  return { set, get, remove, clearExpired };
}
