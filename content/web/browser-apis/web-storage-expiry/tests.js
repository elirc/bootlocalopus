const { createStore } = solution;

/** An in-memory Storage with a size limit in characters (keys + values), like the real one. */
function fakeStorage() {
  const map = new Map();
  const s = {
    capacity: Infinity,
    quotaError: () => new DOMException('The quota has been exceeded.', 'QuotaExceededError'),
    setCalls: 0,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      s.setCalls++;
      v = String(v);
      const used = s.used() - (map.has(k) ? k.length + map.get(k).length : 0);
      if (used + k.length + v.length > s.capacity) throw s.quotaError();
      map.set(k, v);
    },
    removeItem: (k) => { map.delete(k); },
    used: () => [...map].reduce((n, [k, v]) => n + k.length + v.length, 0),
    keys: () => [...map.keys()],
  };
  return s;
}
const clock = (t = 1_000_000) => { const c = () => t; c.advance = (ms) => { t += ms; }; return c; };

describe('values', () => {
  it('round-trips JSON values, including falsy ones, under the prefix', () => {
    const storage = fakeStorage();
    const store = createStore({ storage, prefix: 'app:', now: clock() });
    const values = { obj: { a: [1, { b: 'c' }] }, zero: 0, no: false, empty: '', list: ['x'], text: 'café' };
    for (const [k, v] of Object.entries(values)) expect(store.set(k, v)).toBe(true);
    for (const [k, v] of Object.entries(values)) expect(store.get(k)).toEqual(v);
    expect(storage.keys().every((k) => k.startsWith('app:'))).toBe(true);
    expect(storage.getItem('app:obj')).not.toBe(null);
  });

  it('returns null for a missing key and after remove', () => {
    const store = createStore({ storage: fakeStorage(), prefix: 'app:', now: clock() });
    expect(store.get('nope')).toBe(null);
    store.set('k', 1);
    store.remove('k');
    expect(store.get('k')).toBe(null);
  });

  it('keeps stores with different prefixes apart', () => {
    const storage = fakeStorage();
    const a = createStore({ storage, prefix: 'a:', now: clock() });
    const b = createStore({ storage, prefix: 'b:', now: clock() });
    a.set('k', 'from a');
    b.set('k', 'from b');
    expect(a.get('k')).toBe('from a');
    b.remove('k');
    expect(a.get('k')).toBe('from a');
  });
});

describe('expiry', () => {
  it('expires exactly at now() + ttlMs, and removes the entry', () => {
    const now = clock();
    const storage = fakeStorage();
    const store = createStore({ storage, prefix: 'app:', now });
    store.set('filters', { sort: 'price' }, { ttlMs: 1000 });
    now.advance(999);
    expect(store.get('filters')).toEqual({ sort: 'price' });
    now.advance(1);
    expect(store.get('filters')).toBe(null);
    expect(storage.getItem('app:filters')).toBe(null);
  });

  it('never expires without a ttl', () => {
    const now = clock();
    const store = createStore({ storage: fakeStorage(), prefix: 'app:', now });
    store.set('theme', 'dark');
    now.advance(10 * 365 * 24 * 3600 * 1000);
    expect(store.get('theme')).toBe('dark');
  });

  it('restarts the clock when a key is written again', () => {
    const now = clock();
    const store = createStore({ storage: fakeStorage(), prefix: 'app:', now });
    store.set('k', 1, { ttlMs: 1000 });
    now.advance(800);
    store.set('k', 2, { ttlMs: 1000 });
    now.advance(800);
    expect(store.get('k')).toBe(2);
    store.set('k', 3);
    now.advance(5000);
    expect(store.get('k')).toBe(3);
  });
});

describe('unreadable data', () => {
  it('treats garbage under the prefix as missing, and removes it', () => {
    const storage = fakeStorage();
    storage.setItem('app:a', 'not json{');
    storage.setItem('app:b', '');
    storage.setItem('app:c', 'null');
    const store = createStore({ storage, prefix: 'app:', now: clock() });
    for (const k of ['a', 'b', 'c']) expect(store.get(k)).toBe(null);
    expect(storage.keys()).toEqual([]);
  });
});

describe('clearExpired', () => {
  it('removes expired and unreadable entries under its prefix, including neighbours', () => {
    const now = clock();
    const storage = fakeStorage();
    const store = createStore({ storage, prefix: 'app:', now });
    const other = createStore({ storage, prefix: 'other:', now });
    storage.setItem('theme', 'not json either');
    store.set('e1', 1, { ttlMs: 10 });
    store.set('e2', 2, { ttlMs: 10 });
    store.set('live', 3, { ttlMs: 10_000 });
    storage.setItem('app:junk', '{{');
    store.set('e3', 4, { ttlMs: 10 });
    store.set('forever', 5);
    other.set('theirs', 6, { ttlMs: 10 });
    now.advance(10);
    expect(store.clearExpired()).toBe(4);
    expect(storage.keys().sort()).toEqual(['app:forever', 'app:live', 'other:theirs', 'theme']);
    expect(storage.getItem('theme')).toBe('not json either');
    expect(store.clearExpired()).toBe(0);
  });
});

describe('quota', () => {
  it('evicts expired entries and retries once when storage is full', () => {
    const now = clock();
    const storage = fakeStorage();
    const store = createStore({ storage, prefix: 'app:', now });
    storage.setItem('theme', 'dark');
    for (const k of ['old1', 'old2', 'old3']) store.set(k, 'x'.repeat(80), { ttlMs: 5 });
    store.set('keep', 'k');
    storage.capacity = storage.used() + 100;
    now.advance(5);
    expect(store.set('draft', 'y'.repeat(150))).toBe(true);
    expect(store.get('draft')).toBe('y'.repeat(150));
    expect(store.get('keep')).toBe('k');
    expect(storage.getItem('theme')).toBe('dark');
    expect(storage.keys().filter((k) => k.startsWith('app:old'))).toEqual([]);
  });

  it('returns false when it still does not fit, touching nothing else', () => {
    const now = clock();
    const storage = fakeStorage();
    const store = createStore({ storage, prefix: 'app:', now });
    storage.setItem('theme', 'dark');
    store.set('keep', 'k', { ttlMs: 60_000 });
    storage.capacity = storage.used() + 10;
    storage.setCalls = 0;
    expect(store.set('draft', 'y'.repeat(150))).toBe(false);
    expect(storage.setCalls).toBe(2);
    expect(store.get('draft')).toBe(null);
    expect(store.get('keep')).toBe('k');
    expect(storage.getItem('theme')).toBe('dark');
  });

  it('recognises Firefox\'s quota error name', () => {
    const storage = fakeStorage();
    storage.quotaError = () => Object.assign(new Error('quota'), { name: 'NS_ERROR_DOM_QUOTA_REACHED' });
    const store = createStore({ storage, prefix: 'app:', now: clock() });
    storage.capacity = 5;
    expect(store.set('big', 'z'.repeat(50))).toBe(false);
  });

  it('rethrows errors that are not about quota', () => {
    const storage = fakeStorage();
    storage.setItem = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
    const store = createStore({ storage, prefix: 'app:', now: clock() });
    expect(() => store.set('k', 1)).toThrow('insecure');
  });
});
