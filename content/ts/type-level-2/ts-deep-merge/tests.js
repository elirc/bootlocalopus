const { deepMerge, isPlainObject } = solution;

const defaults = () => ({
  server: { host: 'localhost', port: 3000, tls: null },
  db: { url: 'postgres://local', pool: { min: 1, max: 10 } },
  features: ['search', 'export'],
  retries: 3,
});

describe('isPlainObject', () => {
  it('is true for object literals and null-prototype objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });
  it('is false for arrays, null, Dates, class instances, Maps and primitives', () => {
    class Money { constructor(c) { this.cents = c; } }
    for (const v of [[], null, new Date(), new Money(1), new Map(), 'x', 1, undefined]) {
      expect(isPlainObject(v)).toBe(false);
    }
  });
});

describe('merging', () => {
  it('merges nested objects and keeps untouched siblings', () => {
    const out = deepMerge(defaults(), { server: { port: 8080 }, db: { pool: { max: 50 } } });
    expect(out).toStrictEqual({
      server: { host: 'localhost', port: 8080, tls: null },
      db: { url: 'postgres://local', pool: { min: 1, max: 50 } },
      features: ['search', 'export'],
      retries: 3,
    });
  });
  it('replaces arrays instead of merging them', () => {
    expect(deepMerge(defaults(), { features: ['beta'] }).features).toEqual(['beta']);
    expect(deepMerge(defaults(), { features: [] }).features).toEqual([]);
  });
  it('ignores undefined in the override, but null overwrites', () => {
    const out = deepMerge(defaults(), { retries: undefined, server: { host: null, port: undefined } });
    expect(out.retries).toBe(3);
    expect(out.server.port).toBe(3000);
    expect(out.server.host).toBeNull();
  });
  it('adds keys that exist only in the override', () => {
    expect(deepMerge({ a: 1 }, { b: { c: 2 } })).toStrictEqual({ a: 1, b: { c: 2 } });
  });
  it('lets a primitive replace an object, and an object replace a primitive', () => {
    expect(deepMerge({ x: { y: 1 } }, { x: 5 })).toStrictEqual({ x: 5 });
    expect(deepMerge({ x: 5 }, { x: { y: 1 } })).toStrictEqual({ x: { y: 1 } });
  });
  it('treats a null-prototype override object as a plain object', () => {
    const o = Object.create(null);
    o.port = 1;
    expect(deepMerge(defaults(), { server: o }).server).toEqual({ host: 'localhost', port: 1, tls: null });
  });
});

describe('values that are not plain objects', () => {
  it('replaces class instances by reference instead of merging into them', () => {
    class Money { constructor(cents) { this.cents = cents; } format() { return '$' + this.cents / 100; } }
    const price = new Money(500);
    const out = deepMerge({ price: new Money(100), name: 'x' }, { price });
    expect(out.price).toBe(price);
    expect(out.price.format()).toBe('$5');
  });
  it('keeps Dates as Dates', () => {
    const at = new Date('2026-01-01T00:00:00Z');
    const out = deepMerge({ at: new Date(0) }, { at });
    expect(out.at).toBe(at);
    const kept = deepMerge({ at }, {});
    expect(kept.at).toBeInstanceOf(Date);
    expect(kept.at.getTime()).toBe(at.getTime());
  });
});

describe('isolation', () => {
  it('does not mutate the base or the override', () => {
    const base = defaults();
    const override = { server: { port: 1 }, features: ['a'] };
    deepMerge(base, override);
    expect(base).toStrictEqual(defaults());
    expect(override).toStrictEqual({ server: { port: 1 }, features: ['a'] });
  });
  it('returns a result that shares no plain object or array with the base', () => {
    const base = defaults();
    const out = deepMerge(base, { retries: 5 });
    expect(out).not.toBe(base);
    expect(out.db).not.toBe(base.db);
    expect(out.db.pool).not.toBe(base.db.pool);
    expect(out.features).not.toBe(base.features);
    out.db.pool.max = 999;
    out.features.push('oops');
    expect(base.db.pool.max).toBe(10);
    expect(base.features).toEqual(['search', 'export']);
  });
  it('returns a result that shares no plain object or array with the override', () => {
    const override = { features: ['a'], extra: { deep: { n: 1 } } };
    const out = deepMerge({}, override);
    out.features.push('b');
    out.extra.deep.n = 2;
    expect(override.features).toEqual(['a']);
    expect(override.extra.deep.n).toBe(1);
  });
  it('copies arrays of objects deeply', () => {
    const base = { rules: [{ path: '/a' }] };
    const out = deepMerge(base, {});
    out.rules[0].path = '/changed';
    expect(base.rules[0].path).toBe('/a');
  });
});

describe('untrusted overrides', () => {
  afterEach(() => { delete Object.prototype.polluted; });
  it('ignores a top-level __proto__ key from JSON.parse', () => {
    const evil = JSON.parse('{"__proto__": {"polluted": "yes"}, "retries": 1}');
    const out = deepMerge(defaults(), evil);
    expect({}.polluted).toBeUndefined();
    expect(out.polluted).toBeUndefined();
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(out.retries).toBe(1);
  });
  it('ignores a nested __proto__ key', () => {
    const evil = JSON.parse('{"server": {"__proto__": {"polluted": "yes"}, "port": 2}}');
    const out = deepMerge(defaults(), evil);
    expect({}.polluted).toBeUndefined();
    expect(out.server.polluted).toBeUndefined();
    expect(Object.getPrototypeOf(out.server)).toBe(Object.prototype);
    expect(out.server.port).toBe(2);
  });
  it('ignores constructor and prototype keys', () => {
    const evil = JSON.parse('{"constructor": {"prototype": {"polluted": "yes"}}, "prototype": {"x": 1}}');
    const out = deepMerge({ a: 1 }, evil);
    expect({}.polluted).toBeUndefined();
    expect(Object.hasOwn(out, 'constructor')).toBe(false);
    expect(Object.hasOwn(out, 'prototype')).toBe(false);
    expect(out).toStrictEqual({ a: 1 });
  });
});
