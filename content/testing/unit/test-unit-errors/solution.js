/** Asserts that `fn` throws a PriceError with this code: the class callers catch, and the code they branch on. */
function expectPriceError(fn, code) {
  expect(fn).toThrow(solution.PriceError);
  expect(fn).toThrow({ code });
}

describe('parsePrice: accepted input', () => {
  const valid = [
    ['12', 1200],
    ['12.5', 1250],
    ['£12.50', 1250],
    [' 7.05 ', 705],
    ['0.99', 99],
    ['1,234.56', 123456],
    ['£1,000,000', 100000000],
  ];
  for (const [input, pence] of valid) {
    it(`parses ${JSON.stringify(input)} as ${pence}`, () => {
      expect(solution.parsePrice(input)).toBe(pence);
    });
  }
});

describe('parsePrice: rejected input', () => {
  const invalid = [
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['-5', 'NEGATIVE'],
    ['£-5', 'NEGATIVE'],
    ['12.345', 'PRECISION'],
    ['abc', 'FORMAT'],
    ['12.', 'FORMAT'],
    ['1,23.45', 'FORMAT'],
    ['12,34', 'FORMAT'],
  ];
  for (const [input, code] of invalid) {
    it(`rejects ${JSON.stringify(input)} with ${code}`, () => {
      expectPriceError(() => solution.parsePrice(input), code);
    });
  }

  it('throws a plain TypeError for a non-string, not a PriceError', () => {
    expect(() => solution.parsePrice(12.5)).toThrow(TypeError);
    expect(() => solution.parsePrice(12.5)).not.toThrow(solution.PriceError);
  });
});
