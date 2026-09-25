const { deepMerge, isPlainObject } = solution;

// A polluted prototype would poison every later test, so always clean up.
function withCleanPrototype(fn) {
  try {
    fn();
  } finally {
    for (const k of ['polluted', 'isAdmin', 'viaConstructor']) {
      delete Object.prototype[k];
    }
  }
}

describe('isPlainObject', () => {
  it('accepts literals, JSON output and null-prototype objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(JSON.parse('{"a":{"b":1}}'))).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it('rejects everything else', () => {
    class User {}
    for (const v of [null, undefined, 0, 'x', true, [], [1], () => {}, new Date(), new Map(), new User(), Object.create({})]) {
      expect(isPlainObject(v)).toBe(false);
    }
  });
});

describe('deepMerge: merging', () => {
  it('merges nested plain objects, later sources winning', () => {
    const defaults = { db: { host: 'localhost', port: 5432, pool: { min: 1, max: 5 } }, debug: false };
    const file = { db: { host: 'db.internal', pool: { max: 20 } } };
    const env = { debug: true };
    expect(deepMerge(defaults, file, env)).toEqual({
      db: { host: 'db.internal', port: 5432, pool: { min: 1, max: 20 } },
      debug: true,
    });
  });

  it('replaces arrays instead of concatenating them', () => {
    const out = deepMerge({ tags: ['a', 'b'] }, { tags: ['c'] });
    expect(out.tags).toEqual(['c']);
  });

  it('keeps Dates, Maps and class instances as the same reference', () => {
    class Money { constructor(cents) { this.cents = cents; } }
    const when = new Date(0);
    const price = new Money(500);
    const lookup = new Map([['k', 1]]);
    const out = deepMerge({ when: { x: 1 }, price: { cents: 1 } }, { when, price, lookup });
    expect(out.when).toBe(when);
    expect(out.price).toBe(price);
    expect(out.lookup).toBe(lookup);
  });

  it('a plain object replaces a non-plain value and vice versa', () => {
    expect(deepMerge({ a: [1, 2] }, { a: { x: 1 } }).a).toEqual({ x: 1 });
    expect(deepMerge({ a: { x: 1 } }, { a: 'flat' }).a).toBe('flat');
  });

  it('skips undefined but lets null overwrite', () => {
    const out = deepMerge({ a: 1, b: 2, c: { d: 1 } }, { a: undefined, b: null, c: undefined });
    expect(out).toEqual({ a: 1, b: null, c: { d: 1 } });
    expect(Object.hasOwn(out, 'a')).toBe(true);
  });

  it('ignores sources that are not plain objects', () => {
    expect(deepMerge({ a: 1 }, undefined, null)).toEqual({ a: 1 });
    expect(deepMerge()).toEqual({});
    expect(Object.getPrototypeOf(deepMerge())).toBe(Object.prototype);
  });

  it('copies own enumerable keys only', () => {
    const source = { own: 1 };
    Object.defineProperty(source, 'hidden', { value: 2, enumerable: false });
    expect(Object.keys(deepMerge(source))).toEqual(['own']);
  });

  it('does not copy inherited keys (for...in would)', () => {
    withCleanPrototype(() => {
      // Something else in the process already polluted the prototype.
      Object.prototype.polluted = 'inherited';
      const out = deepMerge({ own: 1, nested: { x: 1 } });
      expect(Object.keys(out)).toEqual(['own', 'nested']);
      expect(Object.keys(out.nested)).toEqual(['x']);
    });
  });

  it('accepts null-prototype sources and returns an ordinary object', () => {
    const bare = Object.create(null);
    bare.a = 1;
    const out = deepMerge(bare, { b: 2 });
    expect(out).toEqual({ a: 1, b: 2 });
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });
});

describe('deepMerge: no shared state', () => {
  it('never mutates its arguments', () => {
    const a = { db: { pool: { max: 5 } }, list: [1] };
    const b = { db: { pool: { min: 1 } }, list: [2] };
    const before = JSON.stringify([a, b]);
    deepMerge(a, b);
    expect(JSON.stringify([a, b])).toBe(before);
  });

  it('returns fresh plain objects even when only one source had them', () => {
    const source = { db: { pool: { max: 5 } } };
    const out = deepMerge(source);
    expect(out.db).not.toBe(source.db);
    expect(out.db.pool).not.toBe(source.db.pool);
    out.db.pool.max = 99;
    expect(source.db.pool.max).toBe(5);
  });
});

describe('deepMerge: prototype pollution', () => {
  it('ignores a top-level __proto__ key from JSON', () => {
    withCleanPrototype(() => {
      const out = deepMerge({ a: 1 }, JSON.parse('{"__proto__": {"isAdmin": true}}'));
      expect({}.isAdmin).toBeUndefined();
      expect(out.isAdmin).toBeUndefined();
      expect(Object.hasOwn(out, '__proto__')).toBe(false);
      expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    });
  });

  it('ignores __proto__ hidden deeper in the payload', () => {
    withCleanPrototype(() => {
      const out = deepMerge({ settings: { theme: 'dark' } }, JSON.parse('{"settings": {"__proto__": {"polluted": "yes"}, "lang": "en"}}'));
      expect({}.polluted).toBeUndefined();
      expect(out.settings).toEqual({ theme: 'dark', lang: 'en' });
      expect(Object.getPrototypeOf(out.settings)).toBe(Object.prototype);
    });
  });

  it('ignores constructor.prototype', () => {
    withCleanPrototype(() => {
      const out = deepMerge({}, JSON.parse('{"constructor": {"prototype": {"viaConstructor": 1}}}'));
      expect({}.viaConstructor).toBeUndefined();
      expect(Object.hasOwn(out, 'constructor')).toBe(false);
      const nested = deepMerge({ a: {} }, JSON.parse('{"a": {"constructor": {"prototype": {"viaConstructor": 1}}}}'));
      expect({}.viaConstructor).toBeUndefined();
      expect(Object.hasOwn(nested.a, 'constructor')).toBe(false);
    });
  });

  it('ignores a prototype key', () => {
    withCleanPrototype(() => {
      const out = deepMerge(JSON.parse('{"prototype": {"polluted": 1}, "ok": 1}'));
      expect(out).toEqual({ ok: 1 });
    });
  });
});
