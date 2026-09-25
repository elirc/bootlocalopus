const { diff, applyPatch } = solution;

// A subtree that throws if anything so much as looks at it.
const untouchable = () => new Proxy({}, {
  get() { throw new Error('diff walked into a shared subtree'); },
  ownKeys() { throw new Error('diff walked into a shared subtree'); },
  has() { throw new Error('diff walked into a shared subtree'); },
  getOwnPropertyDescriptor() { throw new Error('diff walked into a shared subtree'); },
  getPrototypeOf() { throw new Error('diff walked into a shared subtree'); },
});

const snapshot = (x) => JSON.stringify(x);

describe('diff: objects', () => {
  it('no operations for the same value', () => {
    const s = { a: 1 };
    expect(diff(s, s)).toEqual([]);
    expect(diff(1, 1)).toEqual([]);
    expect(diff(NaN, NaN)).toEqual([]);
    expect(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([]);
  });

  it('replace, add and remove, in the specified order', () => {
    const prev = { name: 'Ada', email: 'ada@old.io', address: { city: 'London', zip: 'N1' } };
    const next = { name: 'Ada', address: { city: 'Leeds', zip: 'N1', line2: 'Flat 3' }, phone: '555' };
    expect(diff(prev, next)).toEqual([
      { op: 'replace', path: ['address', 'city'], value: 'Leeds', oldValue: 'London' },
      { op: 'add', path: ['address', 'line2'], value: 'Flat 3' },
      { op: 'add', path: ['phone'], value: '555' },
      { op: 'remove', path: ['email'], oldValue: 'ada@old.io' },
    ]);
  });

  it('a key present with value undefined is present', () => {
    expect(diff({ a: undefined }, {})).toEqual([{ op: 'remove', path: ['a'], oldValue: undefined }]);
    expect(diff({}, { a: undefined })).toEqual([{ op: 'add', path: ['a'], value: undefined }]);
  });

  it('different kinds of value are replaced whole', () => {
    expect(diff({ a: { x: 1 } }, { a: [1] })).toEqual([{ op: 'replace', path: ['a'], value: [1], oldValue: { x: 1 } }]);
    expect(diff({ a: null }, { a: { x: 1 } })).toEqual([{ op: 'replace', path: ['a'], value: { x: 1 }, oldValue: null }]);
    expect(diff('x', 'y')).toEqual([{ op: 'replace', path: [], value: 'y', oldValue: 'x' }]);
  });

  it('Dates compare by time; class instances are replaced, not walked', () => {
    expect(diff({ at: new Date(5) }, { at: new Date(5) })).toEqual([]);
    const later = new Date(6);
    expect(diff({ at: new Date(5) }, { at: later })).toEqual([{ op: 'replace', path: ['at'], value: later, oldValue: new Date(5) }]);
    class Money { constructor(c) { this.cents = c; } }
    const a = new Money(1);
    const b = new Money(1);
    const ops = diff({ price: a }, { price: b });
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('replace');
    expect(ops[0].value).toBe(b);
  });
});

describe('diff: arrays', () => {
  it('changes by index, adds ascending, removes descending', () => {
    expect(diff([1, 2, 3], [1, 20, 3, 4, 5])).toEqual([
      { op: 'replace', path: [1], value: 20, oldValue: 2 },
      { op: 'add', path: [3], value: 4 },
      { op: 'add', path: [4], value: 5 },
    ]);
    expect(diff(['a', 'b', 'c', 'd'], ['a'])).toEqual([
      { op: 'remove', path: [3], oldValue: 'd' },
      { op: 'remove', path: [2], oldValue: 'c' },
      { op: 'remove', path: [1], oldValue: 'b' },
    ]);
  });

  it('recurses into elements with numeric path segments', () => {
    const prev = { rows: [{ id: 1, qty: 1 }, { id: 2, qty: 5 }] };
    const next = { rows: [{ id: 1, qty: 1 }, { id: 2, qty: 6 }] };
    expect(diff(prev, next)).toEqual([{ op: 'replace', path: ['rows', 1, 'qty'], value: 6, oldValue: 5 }]);
  });
});

describe('diff skips shared subtrees', () => {
  it('never looks inside a subtree that is the same object in both', () => {
    const shared = untouchable();
    const rows = Array.from({ length: 50 }, () => untouchable());
    const prev = { big: shared, table: { rows, title: 'Q1' } };
    const next = { big: shared, table: { rows, title: 'Q2' } };
    expect(diff(prev, next)).toEqual([{ op: 'replace', path: ['table', 'title'], value: 'Q2', oldValue: 'Q1' }]);
  });

  it('...including shared elements of arrays that did change', () => {
    const a = untouchable();
    const b = untouchable();
    expect(diff([a, b], [a, b, 'new'])).toEqual([{ op: 'add', path: [2], value: 'new' }]);
  });
});

describe('applyPatch', () => {
  it('applies each kind of operation without mutating', () => {
    const state = { user: { name: 'Ada', email: 'x' }, tags: ['a', 'c'] };
    const before = snapshot(state);
    const out = applyPatch(state, [
      { op: 'replace', path: ['user', 'name'], value: 'Grace' },
      { op: 'remove', path: ['user', 'email'] },
      { op: 'add', path: ['user', 'phone'], value: '555' },
      { op: 'add', path: ['tags', 1], value: 'b' },
    ]);
    expect(out).toEqual({ user: { name: 'Grace', phone: '555' }, tags: ['a', 'b', 'c'] });
    expect(snapshot(state)).toBe(before);
  });

  it('removes array elements by index', () => {
    expect(applyPatch({ list: [1, 2, 3, 4] }, [{ op: 'remove', path: ['list', 3] }, { op: 'remove', path: ['list', 1] }])).toEqual({ list: [1, 3] });
  });

  it('copies only what the operations touch', () => {
    const state = { a: { deep: { x: 1 } }, b: { y: 2 }, list: [{ id: 1 }, { id: 2 }] };
    const out = applyPatch(state, [{ op: 'replace', path: ['list', 1, 'id'], value: 20 }]);
    expect(out.a).toBe(state.a);
    expect(out.b).toBe(state.b);
    expect(out.list[0]).toBe(state.list[0]);
    expect(out.list).not.toBe(state.list);
    expect(out.list[1]).toEqual({ id: 20 });
  });

  it('a replace at the root returns the value; no ops returns the state', () => {
    const state = { a: 1 };
    expect(applyPatch(state, [{ op: 'replace', path: [], value: 42 }])).toBe(42);
    expect(applyPatch(state, [])).toBe(state);
  });
});

describe('round trip', () => {
  const cases = [
    [{ a: 1, b: { c: [1, 2, { d: 3 }] } }, { a: 2, b: { c: [1, { d: 3 }] }, e: null }],
    [[{ id: 1 }, { id: 2 }, { id: 3 }], [{ id: 1, done: true }]],
    [{ list: [] }, { list: ['x', 'y'], extra: { z: [0] } }],
    [{ profile: { tags: ['a', 'b'], name: 'n' }, legacy: true }, { profile: { tags: ['b'], name: 'n' } }],
  ];
  it('applyPatch(prev, diff(prev, next)) equals next', () => {
    for (const [prev, next] of cases) {
      const before = snapshot(prev);
      expect(applyPatch(prev, diff(prev, next))).toEqual(next);
      expect(snapshot(prev)).toBe(before);
    }
  });

  it('shares what did not change', () => {
    const settings = { theme: 'dark' };
    const prev = { settings, cart: { items: [{ sku: 'A' }, { sku: 'B' }] } };
    const next = { settings, cart: { items: [{ sku: 'A' }, { sku: 'B', qty: 2 }] } };
    const out = applyPatch(prev, diff(prev, next));
    expect(out).toEqual(next);
    expect(out.settings).toBe(prev.settings);
    expect(out.cart.items[0]).toBe(prev.cart.items[0]);
  });
});
