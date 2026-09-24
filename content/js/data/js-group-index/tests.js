const users = [
  { id: 1, name: 'ada', team: 'core' },
  { id: 2, name: 'bob', team: 'growth' },
  { id: 3, name: 'cy', team: 'core' },
];

describe('groupBy', () => {
  it('groups by property name', () => {
    expect(solution.groupBy(users, 'team')).toEqual({
      core: [users[0], users[2]],
      growth: [users[1]],
    });
  });
  it('groups by function', () => {
    expect(solution.groupBy([1, 2, 3, 4], (n) => (n % 2 ? 'odd' : 'even'))).toEqual({
      odd: [1, 3],
      even: [2, 4],
    });
  });
  it('preserves input order inside a group', () => {
    expect(solution.groupBy(users, 'team').core.map((u) => u.id)).toEqual([1, 3]);
  });
  it('handles an empty list', () => {
    expect(solution.groupBy([], 'team')).toEqual({});
  });
  it('buckets a missing key under "undefined"', () => {
    const out = solution.groupBy([{ id: 1 }], 'team');
    expect(out.undefined).toHaveLength(1);
  });
});

describe('keyBy', () => {
  it('indexes by id', () => {
    const byId = solution.keyBy(users, 'id');
    expect(byId['2'].name).toBe('bob');
    expect(Object.keys(byId)).toHaveLength(3);
  });
  it('last one wins on a duplicate key', () => {
    const out = solution.keyBy([{ k: 'a', v: 1 }, { k: 'a', v: 2 }], 'k');
    expect(out.a.v).toBe(2);
  });
});

describe('countBy', () => {
  it('counts per key', () => {
    expect(solution.countBy(users, 'team')).toEqual({ core: 2, growth: 1 });
  });
  it('counts with a function', () => {
    expect(solution.countBy([1, 2, 3, 4, 5], (n) => (n > 3 ? 'big' : 'small')))
      .toEqual({ small: 3, big: 2 });
  });
  it('handles an empty list', () => {
    expect(solution.countBy([], 'x')).toEqual({});
  });
});

describe('keys that collide with Object.prototype', () => {
  // User-supplied data: a tag named "constructor" or "__proto__" is not exotic.
  const rows = [{ tag: '__proto__' }, { tag: 'constructor' }, { tag: 'toString' }, { tag: 'constructor' }];
  it('groupBy treats them as ordinary keys', () => {
    const g = solution.groupBy(rows, 'tag');
    expect(Object.keys(g).sort()).toEqual(['__proto__', 'constructor', 'toString']);
    expect(g['constructor']).toHaveLength(2);
    expect(g['__proto__']).toHaveLength(1);
  });
  it('keyBy treats them as ordinary keys', () => {
    expect(Object.keys(solution.keyBy(rows, 'tag')).sort()).toEqual(['__proto__', 'constructor', 'toString']);
  });
  it('countBy treats them as ordinary keys', () => {
    const c = solution.countBy(rows, 'tag');
    expect(c['constructor']).toBe(2);
    expect(c['toString']).toBe(1);
    expect(c['__proto__']).toBe(1);
  });
  it('does not touch Object.prototype', () => {
    solution.groupBy([{ tag: '__proto__' }], 'tag');
    expect(Object.prototype.push).toBeUndefined();
  });
});