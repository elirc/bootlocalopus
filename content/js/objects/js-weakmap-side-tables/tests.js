const { weakMemo, createIdentityKeys } = solution;

const snapshotProps = (obj) => [...Reflect.ownKeys(obj)].map(String).sort();

describe('weakMemo', () => {
  it('computes once per object identity', () => {
    let calls = 0;
    const total = weakMemo((cart) => { calls++; return cart.items.reduce((s, i) => s + i.price, 0); });
    const cart = { items: [{ price: 5 }, { price: 7 }] };
    expect(total(cart)).toBe(12);
    expect(total(cart)).toBe(12);
    expect(calls).toBe(1);
  });

  it('equal contents are still different keys', () => {
    let calls = 0;
    const f = weakMemo(() => ++calls);
    expect(f({ a: 1 })).toBe(1);
    expect(f({ a: 1 })).toBe(2);
  });

  it('caches an undefined result', () => {
    let calls = 0;
    const f = weakMemo(() => { calls++; });
    const obj = {};
    f(obj); f(obj); f(obj);
    expect(calls).toBe(1);
  });

  it('works with functions and arrays as keys', () => {
    let calls = 0;
    const f = weakMemo((x) => { calls++; return typeof x; });
    const fn = () => {};
    const arr = [];
    f(fn); f(fn); f(arr); f(arr);
    expect(calls).toBe(2);
  });

  it('calls through every time for primitives, without throwing', () => {
    let calls = 0;
    const f = weakMemo((n) => { calls++; return n * 2; });
    expect(f(2)).toBe(4);
    expect(f(2)).toBe(4);
    expect(calls).toBe(2);
    expect(() => f(null)).not.toThrow();
    expect(() => f(undefined)).not.toThrow();
  });

  it('works on frozen objects and never touches the argument', () => {
    const f = weakMemo((s) => s.n + 1);
    const frozen = Object.freeze({ n: 1 });
    expect(f(frozen)).toBe(2);
    expect(f(frozen)).toBe(2);

    const plain = { n: 41 };
    const before = snapshotProps(plain);
    f(plain);
    expect(snapshotProps(plain)).toEqual(before);
    expect(JSON.stringify(plain)).toBe('{"n":41}');
  });

  it('has() and forget()', () => {
    let calls = 0;
    const f = weakMemo((o) => { calls++; return o.v; });
    const obj = { v: 1 };
    expect(f.has(obj)).toBe(false);
    f(obj);
    expect(f.has(obj)).toBe(true);
    f.forget(obj);
    expect(f.has(obj)).toBe(false);
    obj.v = 2;
    expect(f(obj)).toBe(2);
    expect(calls).toBe(2);
    expect(f.has(5)).toBe(false);
    expect(() => f.forget(5)).not.toThrow();
  });

  it('separate memos do not share a cache', () => {
    const a = weakMemo(() => 'a');
    const b = weakMemo(() => 'b');
    const obj = {};
    expect(a(obj)).toBe('a');
    expect(b(obj)).toBe('b');
  });
});

describe('createIdentityKeys', () => {
  it('assigns k1, k2, ... in first-seen order and stays stable', () => {
    const keyOf = createIdentityKeys();
    const a = { name: 'a' };
    const b = { name: 'a' };
    expect(keyOf(a)).toBe('k1');
    expect(keyOf(b)).toBe('k2');
    expect(keyOf(a)).toBe('k1');
    expect(keyOf(b)).toBe('k2');
    expect(keyOf([])).toBe('k3');
  });

  it('each keyer has its own counter', () => {
    const k1 = createIdentityKeys();
    const k2 = createIdentityKeys();
    const obj = {};
    k1({}); k1({});
    expect(k1(obj)).toBe('k3');
    expect(k2(obj)).toBe('k1');
  });

  it('works on frozen objects and never touches them', () => {
    const keyOf = createIdentityKeys();
    const frozen = Object.freeze({ id: undefined });
    expect(keyOf(frozen)).toBe('k1');
    const plain = { x: 1 };
    const before = snapshotProps(plain);
    keyOf(plain);
    expect(snapshotProps(plain)).toEqual(before);
  });

  it('throws a TypeError for primitives', () => {
    const keyOf = createIdentityKeys();
    for (const v of [1, 'a', null, undefined, true]) {
      expect(() => keyOf(v)).toThrow(TypeError);
    }
  });
});
