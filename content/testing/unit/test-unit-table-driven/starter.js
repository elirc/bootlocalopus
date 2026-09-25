// Turn these into two tables (inputs that parse, inputs that must be null) and loop over them.

describe('parseDuration', () => {
  it('parses hours and minutes', () => {
    expect(solution.parseDuration('1h30m')).toBe(5_400_000);
  });

  it('parses seconds', () => {
    expect(solution.parseDuration('90s')).toBe(90_000);
  });

  it('rejects nonsense', () => {
    expect(solution.parseDuration('abc')).toBe(null);
  });
});
