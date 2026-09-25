const { diffById } = solution;

const ids = (records) => records.map((r) => r.id);

describe('added, removed and changed', () => {
  it('finds all three, each in the documented order', () => {
    const prev = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 3, n: 'c' }, { id: 4, n: 'd' }];
    const next = [{ id: 6, n: 'f' }, { id: 4, n: 'D' }, { id: 2, n: 'b' }, { id: 5, n: 'e' }, { id: 1, n: 'A' }];
    const d = diffById(prev, next);
    expect(ids(d.added)).toEqual([6, 5]);
    expect(ids(d.removed)).toEqual([3]);
    expect(d.changed.map((c) => c.after.id)).toEqual([4, 1]);
    expect(d.changed[0].before).toBe(prev[3]);
    expect(d.changed[0].after).toBe(next[1]);
  });

  it('returns the original record objects', () => {
    const prev = [{ id: 1 }, { id: 2 }];
    const next = [{ id: 2 }, { id: 3 }];
    const d = diffById(prev, next);
    expect(d.added[0]).toBe(next[1]);
    expect(d.removed[0]).toBe(prev[0]);
  });

  it('handles empty lists on either side', () => {
    expect(diffById([], [])).toEqual({ added: [], removed: [], changed: [] });
    const recs = [{ id: 1 }, { id: 2 }];
    expect(ids(diffById([], recs).added)).toEqual([1, 2]);
    expect(ids(diffById(recs, []).removed)).toEqual([1, 2]);
  });

  it('does not mutate the inputs', () => {
    const prev = [{ id: 2, v: 1 }, { id: 1, v: 1 }];
    const next = [{ id: 3, v: 1 }, { id: 1, v: 2 }];
    const snapshot = JSON.stringify([prev, next]);
    diffById(prev, next);
    expect(JSON.stringify([prev, next])).toBe(snapshot);
  });
});

describe('keys', () => {
  it('keeps 1 and "1" apart (SameValueZero, not string keys)', () => {
    const d = diffById([{ id: 1, v: 'x' }], [{ id: '1', v: 'x' }]);
    expect(d.added.map((r) => r.id)).toStrictEqual(['1']);
    expect(d.removed.map((r) => r.id)).toStrictEqual([1]);
    expect(d.changed).toEqual([]);
  });

  it('does not trip over keys like "__proto__" or "constructor"', () => {
    const prev = [{ id: '__proto__', v: 1 }, { id: 'constructor', v: 1 }];
    const next = [{ id: '__proto__', v: 2 }, { id: 'toString', v: 1 }];
    const d = diffById(prev, next);
    expect(d.added.map((r) => r.id)).toEqual(['toString']);
    expect(d.removed.map((r) => r.id)).toEqual(['constructor']);
    expect(d.changed.map((c) => c.after.id)).toEqual(['__proto__']);
  });

  it('accepts a property name as `key`', () => {
    const d = diffById([{ sku: 'A', q: 1 }], [{ sku: 'A', q: 2 }, { sku: 'B', q: 1 }], { key: 'sku' });
    expect(d.added.map((r) => r.sku)).toEqual(['B']);
    expect(d.changed).toHaveLength(1);
  });

  it('accepts a function as `key` (composite keys)', () => {
    const k = (r) => `${r.shop}/${r.sku}`;
    const prev = [{ shop: 1, sku: 'A', q: 1 }, { shop: 2, sku: 'A', q: 1 }];
    const next = [{ shop: 2, sku: 'A', q: 1 }, { shop: 1, sku: 'B', q: 1 }];
    const d = diffById(prev, next, { key: k });
    expect(d.added.map(k)).toEqual(['1/B']);
    expect(d.removed.map(k)).toEqual(['1/A']);
    expect(d.changed).toEqual([]);
  });

  it('throws on a duplicate key in prev, naming the key', () => {
    expect(() => diffById([{ id: 7 }, { id: 7 }], [])).toThrow(/duplicate.*7|7.*duplicate/i);
  });

  it('throws on a duplicate key in next, naming the key', () => {
    expect(() => diffById([], [{ id: 'x9' }, { id: 'y' }, { id: 'x9' }])).toThrow(/duplicate.*x9|x9.*duplicate/i);
  });
});

describe('the default shallow comparison', () => {
  it('ignores key order', () => {
    const d = diffById([{ id: 1, a: 1, b: 2 }], [{ b: 2, id: 1, a: 1 }]);
    expect(d.changed).toEqual([]);
  });

  it('sees NaN → null as a change, and NaN → NaN as none', () => {
    expect(diffById([{ id: 1, price: NaN }], [{ id: 1, price: null }]).changed).toHaveLength(1);
    expect(diffById([{ id: 1, price: NaN }], [{ id: 1, price: NaN }]).changed).toHaveLength(0);
  });

  it('treats an added key, even one set to undefined, as a change', () => {
    expect(diffById([{ id: 1 }], [{ id: 1, note: undefined }]).changed).toHaveLength(1);
    expect(diffById([{ id: 1, a: 1 }], [{ id: 1, b: 1 }]).changed).toHaveLength(1);
  });

  it('is shallow: a nested object is compared by reference', () => {
    const tags = ['x'];
    expect(diffById([{ id: 1, tags }], [{ id: 1, tags }]).changed).toHaveLength(0);
    expect(diffById([{ id: 1, tags: ['x'] }], [{ id: 1, tags: ['x'] }]).changed).toHaveLength(1);
  });

  it('uses a custom `equals` when given one', () => {
    const calls = [];
    const equals = (a, b) => { calls.push([a.id, b.id]); return a.version === b.version; };
    const d = diffById(
      [{ id: 1, version: 3, junk: 1 }, { id: 2, version: 1 }],
      [{ id: 1, version: 3, junk: 2 }, { id: 2, version: 2 }, { id: 3, version: 1 }],
      { equals },
    );
    expect(d.changed.map((c) => c.after.id)).toEqual([2]);
    expect(calls).toEqual([[1, 1], [2, 2]]);
  });
});

describe('scale', () => {
  it('diffs 100 000 records against 100 000 records', () => {
    const N = 100_000;
    const prev = [];
    const next = [];
    for (let i = 0; i < N; i++) prev.push({ id: i, v: i });
    for (let i = N / 2; i < N + N / 2; i++) next.push({ id: i, v: i % 10 === 0 ? -1 : i });
    const d = diffById(prev, next);
    expect(d.added).toHaveLength(N / 2);
    expect(d.removed).toHaveLength(N / 2);
    expect(d.changed).toHaveLength(N / 2 / 10);
    expect(d.added[0].id).toBe(N);
    expect(d.removed[0].id).toBe(0);
  });
});
