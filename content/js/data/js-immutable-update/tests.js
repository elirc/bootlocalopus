const state = {
  user: { name: 'ada', prefs: { theme: 'dark', density: 'cosy' } },
  posts: [
    { id: 1, title: 'first', tags: ['a'] },
    { id: 2, title: 'second', tags: ['b'] },
  ],
  meta: { fetchedAt: 123 },
};

describe('setIn', () => {
  it('sets a nested value', () => {
    const next = solution.setIn(state, ['user', 'prefs', 'theme'], 'light');
    expect(next.user.prefs.theme).toBe('light');
  });

  it('does not mutate the input', () => {
    const before = JSON.stringify(state);
    solution.setIn(state, ['user', 'prefs', 'theme'], 'light');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('replaces every object on the path with a new reference', () => {
    const next = solution.setIn(state, ['user', 'prefs', 'theme'], 'light');
    expect(next).not.toBe(state);
    expect(next.user).not.toBe(state.user);
    expect(next.user.prefs).not.toBe(state.user.prefs);
  });

  it('keeps branches off the path referentially identical', () => {
    const next = solution.setIn(state, ['user', 'prefs', 'theme'], 'light');
    expect(next.posts).toBe(state.posts);
    expect(next.meta).toBe(state.meta);
  });

  it('works through arrays and keeps siblings identical', () => {
    const next = solution.setIn(state, ['posts', 1, 'title'], 'renamed');
    expect(Array.isArray(next.posts)).toBe(true);
    expect(next.posts[1].title).toBe('renamed');
    expect(next.posts[0]).toBe(state.posts[0]);
    expect(next.posts).not.toBe(state.posts);
    expect(next.posts[1].tags).toBe(state.posts[1].tags);
  });

  it('creates missing objects along the way', () => {
    const next = solution.setIn({}, ['a', 'b', 'c'], 1);
    expect(next).toEqual({ a: { b: { c: 1 } } });
  });

  it('creates an array when the key is numeric', () => {
    const next = solution.setIn({}, ['list', 0, 'ok'], true);
    expect(Array.isArray(next.list)).toBe(true);
    expect(next.list[0]).toEqual({ ok: true });
  });

  it('an empty path replaces the whole value', () => {
    expect(solution.setIn(state, [], 'replaced')).toBe('replaced');
  });
});

describe('updateIn', () => {
  it('passes the current value to the updater', () => {
    const next = solution.updateIn(state, ['meta', 'fetchedAt'], (n) => n + 1);
    expect(next.meta.fetchedAt).toBe(124);
    expect(state.meta.fetchedAt).toBe(123);
  });

  it('appends to a nested array without mutating it', () => {
    const next = solution.updateIn(state, ['posts', 0, 'tags'], (tags) => [...tags, 'new']);
    expect(next.posts[0].tags).toEqual(['a', 'new']);
    expect(state.posts[0].tags).toEqual(['a']);
    expect(next.posts[1]).toBe(state.posts[1]);
  });

  it('gives the updater undefined for a missing path', () => {
    const next = solution.updateIn({}, ['count'], (n) => (n ?? 0) + 1);
    expect(next.count).toBe(1);
  });
});