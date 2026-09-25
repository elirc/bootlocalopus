const { applyRate } = solution;

// amount 125 at 10% is 12.5; 124 → 12.4; -126 → -12.6
const table = [
  //             12.5  -12.5  12.4  -12.6
  ['halfExpand', [13, -13, 12, -13]],
  ['halfEven', [12, -12, 12, -13]],
  ['floor', [12, -13, 12, -13]],
  ['ceil', [13, -12, 13, -12]],
  ['trunc', [12, -12, 12, -12]],
];

describe('rounding modes', () => {
  for (const [mode, expected] of table) {
    it(`${mode} matches the table`, () => {
      expect([
        applyRate(125, 1000, mode),
        applyRate(-125, 1000, mode),
        applyRate(124, 1000, mode),
        applyRate(-126, 1000, mode),
      ]).toEqual(expected);
    });
  }

  it('defaults to halfEven', () => {
    expect(applyRate(125, 1000)).toBe(12);
    expect(applyRate(135, 1000)).toBe(14);
    expect(applyRate(-135, 1000)).toBe(-14);
  });

  it('halfEven rounds halves to the even neighbour on both sides of zero', () => {
    const halves = [5, 15, 25, 35, -5, -15, -25].map((tenths) => applyRate(tenths, 1000, 'halfEven'));
    expect(halves).toEqual([0, 2, 2, 4, 0, -2, -2]);
  });

  it('halfExpand rounds negative halves away from zero (unlike Math.round)', () => {
    expect(applyRate(-25, 1000, 'halfExpand')).toBe(-3);
    expect(applyRate(-5, 1000, 'halfExpand')).toBe(-1);
  });
});

describe('ordinary rates', () => {
  it('computes 20% VAT on typical prices', () => {
    expect(applyRate(1999, 2000, 'halfExpand')).toBe(400); // 399.8
    expect(applyRate(1999, 2000, 'floor')).toBe(399);
    expect(applyRate(4999, 2000, 'halfEven')).toBe(1000); // 999.8
    expect(applyRate(10000, 2000)).toBe(2000);
  });

  it('handles tiny and large rates', () => {
    expect(applyRate(123456, 1, 'halfExpand')).toBe(12); // 12.3456
    expect(applyRate(800, 12500)).toBe(1000); // 125%
    expect(applyRate(1, 5000, 'halfEven')).toBe(0); // 0.5
    expect(applyRate(1, 5000, 'halfExpand')).toBe(1);
  });

  it('never returns -0', () => {
    for (const mode of ['halfExpand', 'halfEven', 'floor', 'ceil', 'trunc']) {
      expect(Object.is(applyRate(-1, 1000, mode === 'floor' ? 'ceil' : mode), 0)).toBe(true);
      expect(Object.is(applyRate(0, 1000, mode), 0)).toBe(true);
      expect(Object.is(applyRate(-500, 0, mode), 0)).toBe(true);
    }
  });
});

describe('exactness beyond 2**53', () => {
  it('rounds the true value even when amount × rate is not representable', () => {
    // 7380638431926892 × 1250 / 10000 = 922579803990861.5 exactly
    expect(applyRate(7380638431926892, 1250, 'halfExpand')).toBe(922579803990862);
    expect(applyRate(7380638431926892, 1250, 'halfEven')).toBe(922579803990862);
    expect(applyRate(7380638431926892, 1250, 'floor')).toBe(922579803990861);
    expect(applyRate(-7380638431926892, 1250, 'halfExpand')).toBe(-922579803990862);
  });

  it('breaks an exact half to even at large magnitudes', () => {
    // 8476157168806095 × 5000 / 10000 = 4238078584403047.5 → even neighbour ends in 8
    expect(applyRate(8476157168806095, 5000, 'halfEven')).toBe(4238078584403048);
    // 7533509484482741 × 5000 / 10000 = 3766754742241370.5 → even neighbour ends in 0
    expect(applyRate(7533509484482741, 5000, 'halfEven')).toBe(3766754742241370);
    expect(applyRate(7533509484482741, 5000, 'halfExpand')).toBe(3766754742241371);
  });

  it('works for the largest safe amount at 100%', () => {
    expect(applyRate(Number.MAX_SAFE_INTEGER, 10000)).toBe(Number.MAX_SAFE_INTEGER);
    expect(applyRate(-Number.MAX_SAFE_INTEGER, 10000)).toBe(-Number.MAX_SAFE_INTEGER);
  });
});

describe('validation', () => {
  it('rejects non-integer or unsafe inputs', () => {
    expect(() => applyRate(12.5, 1000)).toThrow(RangeError);
    expect(() => applyRate(2 ** 53, 1000)).toThrow(RangeError);
    expect(() => applyRate('125', 1000)).toThrow(RangeError);
    expect(() => applyRate(125, 10.5)).toThrow(RangeError);
    expect(() => applyRate(125, -1)).toThrow(RangeError);
    expect(() => applyRate(125, NaN)).toThrow(RangeError);
  });

  it('rejects an unknown mode', () => {
    expect(() => applyRate(125, 1000, 'half-up')).toThrow(RangeError);
    expect(() => applyRate(125, 1000, 'round')).toThrow(RangeError);
  });

  it('rejects a result outside the safe range', () => {
    expect(() => applyRate(Number.MAX_SAFE_INTEGER, 20000)).toThrow(RangeError);
  });
});
