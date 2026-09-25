const { parseAmount, formatAmount } = solution;

describe('parseAmount: valid input', () => {
  it('parses plain amounts into minor units', () => {
    expect(parseAmount('12.50')).toBe(1250);
    expect(parseAmount('12.5')).toBe(1250);
    expect(parseAmount('12')).toBe(1200);
    expect(parseAmount('0.05')).toBe(5);
    expect(parseAmount('007.10')).toBe(710);
  });

  it('does not lose a cent to binary floating point', () => {
    expect(parseAmount('19.99')).toBe(1999);
    expect(parseAmount('0.29')).toBe(29);
    expect(parseAmount('4.35')).toBe(435);
  });

  it('trims surrounding whitespace', () => {
    expect(parseAmount('  42.00 \n')).toBe(4200);
  });

  it('accepts correctly grouped thousands', () => {
    expect(parseAmount('1,234.56')).toBe(123456);
    expect(parseAmount('12,345,678')).toBe(1234567800);
    expect(parseAmount('999,999.9')).toBe(99999990);
  });

  it('handles negatives, and never returns -0', () => {
    expect(parseAmount('-0.05')).toBe(-5);
    expect(parseAmount('-1,000')).toBe(-100000);
    expect(Object.is(parseAmount('-0'), 0)).toBe(true);
    expect(Object.is(parseAmount('-0.00'), 0)).toBe(true);
  });

  it('respects the number of minor digits', () => {
    expect(parseAmount('1,234', 0)).toBe(1234);
    expect(parseAmount('1.005', 3)).toBe(1005);
    expect(parseAmount('1.5', 3)).toBe(1500);
    expect(parseAmount('0.001', 3)).toBe(1);
  });

  it('is exact for every safe amount, however large', () => {
    expect(parseAmount('39710498877105.77')).toBe(3971049887710577);
    expect(parseAmount('85674484087630.01')).toBe(8567448408763001);
    expect(parseAmount('90,071,992,547,409.91')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('parseAmount: invalid input returns null', () => {
  const bad = [
    '', '   ', 'abc', '12abc', 'abc12', '1.2.3', '1e3', '1E3', '.5', '12.', '-', '--5', '+5', '- 5',
    '1,23', '1,2345', ',123', '1,,234', '12,34.5', '1 234', 'Infinity', 'NaN', '0x10', '١٢', '１２',
    '12.345', '$12', '12 USD',
  ];
  for (const text of bad) {
    it(`rejects ${JSON.stringify(text)}`, () => {
      expect(parseAmount(text)).toBeNull();
    });
  }

  it('rejects a fraction with digits = 0', () => {
    expect(parseAmount('12.5', 0)).toBeNull();
    expect(parseAmount('12.0', 0)).toBeNull();
  });

  it('rejects non-strings', () => {
    for (const v of [12.5, null, undefined, {}, ['12']]) expect(parseAmount(v)).toBeNull();
  });

  it('rejects amounts beyond the safe integer range', () => {
    expect(parseAmount('90071992547409.92')).toBeNull();
    expect(parseAmount('1' + '0'.repeat(30))).toBeNull();
  });
});

describe('formatAmount', () => {
  it('formats with exactly `digits` fraction digits', () => {
    expect(formatAmount(1250)).toBe('12.50');
    expect(formatAmount(5)).toBe('0.05');
    expect(formatAmount(0)).toBe('0.00');
    expect(formatAmount(123456789)).toBe('1234567.89');
    expect(formatAmount(1234, 0)).toBe('1234');
    expect(formatAmount(1, 3)).toBe('0.001');
  });

  it('puts the sign in front of negatives, including small ones', () => {
    expect(formatAmount(-5)).toBe('-0.05');
    expect(formatAmount(-100000)).toBe('-1000.00');
    expect(formatAmount(-7, 0)).toBe('-7');
  });

  it('is exact for large amounts', () => {
    expect(formatAmount(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');
    expect(formatAmount(3971049887710577)).toBe('39710498877105.77');
  });

  it('round-trips through parseAmount', () => {
    for (const d of [0, 2, 3]) {
      for (const n of [0, 1, -1, 99, 100, 101, -1999, 123456789, 3971049887710577]) {
        expect(parseAmount(formatAmount(n, d), d)).toBe(n);
      }
    }
  });
});
