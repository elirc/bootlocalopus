describe('createCounter', () => {
  it('starts at 0 by default', () => {
    expect(solution.createCounter().value()).toBe(0);
  });
  it('accepts a starting value', () => {
    expect(solution.createCounter(7).value()).toBe(7);
  });
  it('increments and decrements, returning the new value', () => {
    const c = solution.createCounter(10);
    expect(c.increment()).toBe(11);
    expect(c.increment()).toBe(12);
    expect(c.decrement()).toBe(11);
    expect(c.value()).toBe(11);
  });
  it('keeps the count private', () => {
    const c = solution.createCounter(3);
    const leaked = Object.keys(c).filter((k) => typeof c[k] !== 'function');
    expect(leaked).toEqual([]);
    expect(JSON.stringify(c)).toBe('{}');
  });
  it('gives each counter its own state', () => {
    const a = solution.createCounter();
    const b = solution.createCounter();
    a.increment();
    a.increment();
    expect(a.value()).toBe(2);
    expect(b.value()).toBe(0);
  });
});