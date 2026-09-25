const { sortBy } = solution;

const pluck = (rows, k = 'id') => rows.map((r) => r[k]);

describe('basics', () => {
  it('sorts numbers numerically, not as text', () => {
    const rows = [10, 9, 1, 100, 25].map((n, id) => ({ id, n }));
    expect(pluck(sortBy(rows, ['n']), 'n')).toEqual([1, 9, 10, 25, 100]);
  });

  it('returns a new array and leaves the input alone', () => {
    const rows = [{ id: 1, n: 3 }, { id: 2, n: 1 }, { id: 3, n: 2 }];
    const copy = [...rows];
    const out = sortBy(rows, ['n']);
    expect(out).not.toBe(rows);
    expect(rows).toEqual(copy);
    expect(rows.every((r, i) => r === copy[i])).toBe(true);
    expect(pluck(out)).toEqual([2, 3, 1]);
  });

  it('returns a copy in input order for empty criteria', () => {
    const rows = [{ id: 2 }, { id: 1 }];
    const out = sortBy(rows, []);
    expect(out).not.toBe(rows);
    expect(pluck(out)).toEqual([2, 1]);
  });

  it('compares Dates by time', () => {
    const rows = [
      { id: 'b', at: new Date('2025-03-01T00:00:00Z') },
      { id: 'a', at: new Date('2024-12-31T23:59:59Z') },
      { id: 'c', at: new Date('2025-03-01T00:00:01Z') },
    ];
    expect(pluck(sortBy(rows, ['at']))).toEqual(['a', 'b', 'c']);
    expect(pluck(sortBy(rows, [{ key: 'at', dir: 'desc' }]))).toEqual(['c', 'b', 'a']);
  });

  it('accepts a function key', () => {
    const rows = [{ id: 1, name: 'ccc' }, { id: 2, name: 'a' }, { id: 3, name: 'bb' }];
    expect(pluck(sortBy(rows, [{ key: (r) => r.name.length }]))).toEqual([2, 3, 1]);
  });

  it('throws a RangeError on an unknown direction', () => {
    expect(() => sortBy([{ n: 1 }, { n: 2 }], [{ key: 'n', dir: 'descending' }])).toThrow(RangeError);
  });
});

describe('several criteria', () => {
  const people = [
    { id: 1, team: 'web', age: 30 },
    { id: 2, team: 'api', age: 25 },
    { id: 3, team: 'web', age: 41 },
    { id: 4, team: 'api', age: 25 },
    { id: 5, team: 'web', age: 30 },
    { id: 6, team: 'api', age: 52 },
  ];

  it('uses later criteria only to break ties', () => {
    expect(pluck(sortBy(people, ['team', { key: 'age', dir: 'desc' }]))).toEqual([6, 2, 4, 3, 1, 5]);
  });

  it('keeps ties in input order in ascending sorts', () => {
    expect(pluck(sortBy(people, ['age']))).toEqual([2, 4, 1, 5, 3, 6]);
  });

  it('keeps ties in input order in descending sorts too (not a reversed ascending sort)', () => {
    expect(pluck(sortBy(people, [{ key: 'age', dir: 'desc' }]))).toEqual([6, 3, 1, 5, 2, 4]);
    expect(pluck(sortBy(people, [{ key: 'team', dir: 'desc' }]))).toEqual([1, 3, 5, 2, 4, 6]);
  });

  it('is stable on a larger input', () => {
    const rows = Array.from({ length: 2000 }, (_, id) => ({ id, bucket: (id * 7) % 5 }));
    const out = sortBy(rows, [{ key: 'bucket', dir: 'desc' }]);
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1];
      const b = out[i];
      expect(a.bucket > b.bucket || (a.bucket === b.bucket && a.id < b.id)).toBe(true);
    }
  });
});

describe('missing values', () => {
  const rows = [
    { id: 'a', score: 5 },
    { id: 'b', score: null },
    { id: 'c', score: 1 },
    { id: 'd' },
    { id: 'e', score: NaN },
    { id: 'f', score: 3 },
  ];

  it('go last when ascending, in input order', () => {
    expect(pluck(sortBy(rows, ['score']))).toEqual(['c', 'f', 'a', 'b', 'd', 'e']);
  });

  it('still go last when descending, in input order', () => {
    expect(pluck(sortBy(rows, [{ key: 'score', dir: 'desc' }]))).toEqual(['a', 'f', 'c', 'b', 'd', 'e']);
  });

  it('tie with each other so the next criterion decides', () => {
    const r = [
      { id: 1, due: null, title: 'b' },
      { id: 2, due: 5, title: 'z' },
      { id: 3, due: undefined, title: 'a' },
    ];
    expect(pluck(sortBy(r, ['due', 'title']))).toEqual([2, 3, 1]);
  });

  it('do not break numeric order around them', () => {
    const r = [7, null, 2, NaN, 9, undefined, 4, 1].map((n, id) => ({ id, n }));
    expect(pluck(sortBy(r, ['n']), 'n').slice(0, 5)).toEqual([1, 2, 4, 7, 9]);
  });
});
