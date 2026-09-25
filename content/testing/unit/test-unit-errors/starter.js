// These tests are green. Are they checking what callers depend on?

describe('parsePrice', () => {
  it('parses pounds and pence', () => {
    expect(solution.parsePrice('£12.50')).toBe(1250);
  });

  it('rejects garbage', () => {
    expect(() => solution.parsePrice('abc')).toThrow();
  });

  it('rejects too many decimals', () => {
    expect(() => solution.parsePrice('12.345')).toThrow();
  });

  it('rejects negative prices', () => {
    expect(() => solution.parsePrice('-5')).toThrow();
  });
});
