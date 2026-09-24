describe('once', () => {
  it('calls through exactly once', () => {
    let calls = 0;
    const init = solution.once(() => { calls++; return 'ready'; });
    expect(init()).toBe('ready');
    expect(init()).toBe('ready');
    expect(init('ignored')).toBe('ready');
    expect(calls).toBe(1);
  });
  it('caches an undefined result too', () => {
    let calls = 0;
    const f = solution.once(() => { calls++; });
    f(); f(); f();
    expect(calls).toBe(1);
  });
  it('passes through the first arguments', () => {
    const f = solution.once((a, b) => a + b);
    expect(f(2, 3)).toBe(5);
  });
  it('keeps the caller as this', () => {
    const obj = { n: 41, bump: solution.once(function () { return this.n + 1; }) };
    expect(obj.bump()).toBe(42);
  });
});

describe('memoize', () => {
  it('only computes once per distinct argument list', () => {
    let calls = 0;
    const slow = solution.memoize((a, b) => { calls++; return a * b; });
    expect(slow(3, 4)).toBe(12);
    expect(slow(3, 4)).toBe(12);
    expect(calls).toBe(1);
    expect(slow(5, 2)).toBe(10);
    expect(calls).toBe(2);
  });
  it('caches falsy and undefined results', () => {
    let calls = 0;
    const f = solution.memoize(() => { calls++; return undefined; });
    f(); f();
    expect(calls).toBe(1);
  });
  it('honours a custom key function', () => {
    let calls = 0;
    const byId = solution.memoize((user) => { calls++; return user.name; }, (user) => user.id);
    expect(byId({ id: 1, name: 'ada' })).toBe('ada');
    expect(byId({ id: 1, name: 'someone else' })).toBe('ada');
    expect(calls).toBe(1);
  });
  it('exposes the cache as a Map', () => {
    const f = solution.memoize((n) => n + 1);
    f(1);
    expect(f.cache).toBeInstanceOf(Map);
    expect(f.cache.size).toBe(1);
    f.cache.clear();
    expect(f.cache.size).toBe(0);
  });
});