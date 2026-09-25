const { LruCache } = solution;

function recorder() {
  const evicted = [];
  return { evicted, onEvict: (k, v) => evicted.push([k, v]) };
}

describe('construction', () => {
  it('rejects a max that is not a positive integer', () => {
    for (const max of [0, -1, 2.5, NaN, '3', undefined]) {
      expect(() => new LruCache({ max })).toThrow(RangeError);
    }
  });
});

describe('basic map behaviour', () => {
  it('stores and returns values; misses are undefined', () => {
    const c = new LruCache({ max: 3 });
    expect(c.set('a', 1)).toBe(c);
    c.set('b', 2);
    expect(c.get('a')).toBe(1);
    expect(c.get('zzz')).toBeUndefined();
    expect(c.size).toBe(2);
  });

  it('delete removes and reports whether the key was there', () => {
    const c = new LruCache({ max: 3 });
    c.set('a', 1);
    expect(c.delete('a')).toBe(true);
    expect(c.delete('a')).toBe(false);
    expect(c.has('a')).toBe(false);
    expect(c.size).toBe(0);
  });

  it('compares keys like a Map: objects by identity, NaN works, 1 !== "1"', () => {
    const c = new LruCache({ max: 5 });
    const k1 = { id: 1 };
    c.set(k1, 'obj').set(NaN, 'nan').set(1, 'num').set('1', 'str');
    expect(c.get(k1)).toBe('obj');
    expect(c.get({ id: 1 })).toBeUndefined();
    expect(c.get(NaN)).toBe('nan');
    expect(c.get(1)).toBe('num');
    expect(c.get('1')).toBe('str');
  });
});

describe('eviction', () => {
  it('evicts the least recently set key when full, and reports it', () => {
    const { evicted, onEvict } = recorder();
    const c = new LruCache({ max: 2, onEvict });
    c.set('a', 1).set('b', 2).set('c', 3);
    expect(c.has('a')).toBe(false);
    expect(c.keys()).toEqual(['b', 'c']);
    expect(evicted).toEqual([['a', 1]]);
    expect(c.size).toBe(2);
  });

  it('a get makes the key most recently used', () => {
    const c = new LruCache({ max: 2 });
    c.set('a', 1).set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.keys()).toEqual(['a', 'c']);
  });

  it('overwriting a key refreshes it and evicts nothing', () => {
    const { evicted, onEvict } = recorder();
    const c = new LruCache({ max: 2, onEvict });
    c.set('a', 1).set('b', 2).set('a', 10);
    expect(evicted).toEqual([]);
    expect(c.keys()).toEqual(['b', 'a']);
    expect(c.get('a')).toBe(10);
    c.set('c', 3);
    expect(evicted).toEqual([['b', 2]]);
  });

  it('has and peek do not change the order', () => {
    const c = new LruCache({ max: 2 });
    c.set('a', 1).set('b', 2);
    expect(c.has('a')).toBe(true);
    expect(c.peek('a')).toBe(1);
    c.set('c', 3);
    expect(c.keys()).toEqual(['b', 'c']);
  });

  it('treats undefined, 0 and "" as real values that get refreshed', () => {
    for (const falsy of [undefined, 0, '', null, false]) {
      const c = new LruCache({ max: 2 });
      c.set('a', falsy).set('b', 'x');
      expect(c.has('a')).toBe(true);
      expect(c.get('a')).toBe(falsy);
      c.set('c', 'y');
      expect(c.keys()).toEqual(['a', 'c']);
    }
  });

  it('does not call onEvict for delete', () => {
    const { evicted, onEvict } = recorder();
    const c = new LruCache({ max: 2, onEvict });
    c.set('a', 1);
    c.delete('a');
    expect(evicted).toEqual([]);
  });

  it('works with max 1', () => {
    const { evicted, onEvict } = recorder();
    const c = new LruCache({ max: 1, onEvict });
    c.set('a', 1).set('a', 2).set('b', 3);
    expect(c.keys()).toEqual(['b']);
    expect(evicted).toEqual([['a', 2]]);
  });

  it('keeps the recency order over a longer run', () => {
    const c = new LruCache({ max: 3 });
    c.set(1, 1).set(2, 2).set(3, 3);
    c.get(1);
    c.set(4, 4); // evicts 2
    c.get(3);
    c.set(5, 5); // evicts 1
    expect(c.keys()).toEqual([4, 3, 5]);
  });

  it('stays O(1) per operation (200 000 operations on a cache of 50 000)', () => {
    const c = new LruCache({ max: 50_000 });
    for (let i = 0; i < 100_000; i++) c.set(i, i);
    let hits = 0;
    for (let i = 0; i < 100_000; i++) if (c.get(i) !== undefined) hits++;
    expect(hits).toBe(50_000);
    expect(c.size).toBe(50_000);
  });
});
