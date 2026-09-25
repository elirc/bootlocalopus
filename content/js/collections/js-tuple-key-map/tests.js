const { TupleMap } = solution;

describe('lookups by value', () => {
  it('finds a key built from a fresh array', () => {
    const m = new TupleMap();
    expect(m.set([7, '2025-03-01'], 'x')).toBe(m);
    expect(m.get([7, '2025-03-01'])).toBe('x');
    expect(m.has([7, '2025-03-01'])).toBe(true);
    expect(m.get([7, '2025-03-02'])).toBeUndefined();
    expect(m.has([8, '2025-03-01'])).toBe(false);
  });

  it('does not let a separator collide', () => {
    const m = new TupleMap();
    m.set(['a,b'], 1).set(['a', 'b'], 2).set(['ab', 'c'], 3).set(['a', 'bc'], 4);
    expect([m.get(['a,b']), m.get(['a', 'b']), m.get(['ab', 'c']), m.get(['a', 'bc'])]).toEqual([1, 2, 3, 4]);
    expect(m.size).toBe(4);
  });

  it('keeps types apart: 1 vs "1", null vs undefined vs "null"', () => {
    const m = new TupleMap();
    m.set([1], 'num').set(['1'], 'str').set([null], 'null').set([undefined], 'undef').set(['null'], 'text');
    expect(m.get([1])).toBe('num');
    expect(m.get(['1'])).toBe('str');
    expect(m.get([null])).toBe('null');
    expect(m.get([undefined])).toBe('undef');
    expect(m.get(['null'])).toBe('text');
    expect(m.size).toBe(5);
  });

  it('uses SameValueZero: NaN finds NaN, 0 finds -0', () => {
    const m = new TupleMap();
    m.set([NaN, 1], 'nan').set([0], 'zero');
    expect(m.get([NaN, 1])).toBe('nan');
    expect(m.get([null, 1])).toBeUndefined();
    expect(m.get([-0])).toBe('zero');
  });

  it('compares objects by identity', () => {
    const alice = { id: 1 };
    const bob = { id: 1 };
    const m = new TupleMap();
    m.set([alice, 'read'], true);
    expect(m.get([alice, 'read'])).toBe(true);
    expect(m.has([bob, 'read'])).toBe(false);
    m.set([bob, 'read'], false);
    expect(m.size).toBe(2);
  });

  it('treats different lengths as different keys, and [] as a key', () => {
    const m = new TupleMap();
    m.set([1], 'one').set([1, undefined], 'two').set([], 'empty');
    expect(m.get([1])).toBe('one');
    expect(m.get([1, undefined])).toBe('two');
    expect(m.get([])).toBe('empty');
    expect(m.has([1, undefined, undefined])).toBe(false);
    expect(m.size).toBe(3);
  });

  it('a prefix of a stored key is not a key', () => {
    const m = new TupleMap();
    m.set(['a', 'b', 'c'], 1);
    expect(m.has(['a', 'b'])).toBe(false);
    expect(m.has(['a'])).toBe(false);
    expect(m.get(['a', 'b'])).toBeUndefined();
    expect(m.size).toBe(1);
  });
});

describe('updates', () => {
  it('overwriting keeps size and position', () => {
    const m = new TupleMap();
    m.set(['a'], 1).set(['b'], 2).set(['a'], 3);
    expect(m.size).toBe(2);
    expect(m.entries()).toEqual([[['a'], 3], [['b'], 2]]);
  });

  it('stores undefined values', () => {
    const m = new TupleMap();
    m.set(['k'], undefined);
    expect(m.has(['k'])).toBe(true);
    expect(m.size).toBe(1);
  });

  it('delete removes only the exact key and reports it', () => {
    const m = new TupleMap();
    m.set(['a'], 1).set(['a', 'b'], 2);
    expect(m.delete(['a', 'x'])).toBe(false);
    expect(m.delete(['a'])).toBe(true);
    expect(m.delete(['a'])).toBe(false);
    expect(m.has(['a'])).toBe(false);
    expect(m.get(['a', 'b'])).toBe(2);
    expect(m.size).toBe(1);
    m.set(['a'], 9);
    expect(m.entries()).toEqual([[['a', 'b'], 2], [['a'], 9]]);
  });

  it('is not affected when the caller mutates their key array', () => {
    const m = new TupleMap();
    const key = [1, 2];
    m.set(key, 'v');
    key.push(3);
    key[0] = 99;
    expect(m.get([1, 2])).toBe('v');
    expect(m.entries()).toEqual([[[1, 2], 'v']]);
  });

  it('entries lists keys and values in insertion order', () => {
    const m = new TupleMap();
    const o = { id: 1 };
    m.set([2, 'b'], 'B').set([o], 'O').set([], 'E');
    const e = m.entries();
    expect(e).toHaveLength(3);
    expect(e[0]).toEqual([[2, 'b'], 'B']);
    expect(e[1][0][0]).toBe(o);
    expect(e[2]).toEqual([[], 'E']);
  });
});
