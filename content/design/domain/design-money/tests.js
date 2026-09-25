const { Money, CurrencyMismatchError } = solution;
const gbp = (n) => Money.of(n, 'GBP');
const errorOf = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const attempt = (fn) => { try { fn(); } catch { /* immutable: fine */ } };

describe('construction', () => {
  it('holds integer minor units and a currency', () => {
    const m = gbp(1234);
    expect(m.amountMinor).toBe(1234);
    expect(m.currency).toBe('GBP');
    expect(JSON.parse(JSON.stringify(m))).toEqual({ amountMinor: 1234, currency: 'GBP' });
  });

  it('refuses fractional minor units, NaN, unsafe integers and unknown currencies', () => {
    for (const [amount, currency] of [[12.5, 'GBP'], [NaN, 'GBP'], [Infinity, 'GBP'], ['100', 'GBP'], [2 ** 53, 'GBP'], [100, 'XXX'], [100, 'gbp'], [100, 'toString']]) {
      expect(errorOf(() => Money.of(amount, currency))).toBeInstanceOf(RangeError);
    }
  });

  it('is immutable', () => {
    const m = gbp(100);
    attempt(() => { m.amountMinor = 1; });
    attempt(() => { m.currency = 'USD'; });
    expect([m.amountMinor, m.currency]).toEqual([100, 'GBP']);
  });
});

describe('parse: decimal text to minor units, without floats', () => {
  it('parses per the currency\'s decimal places', () => {
    expect(Money.parse('12.34', 'GBP').amountMinor).toBe(1234);
    expect(Money.parse('12.3', 'GBP').amountMinor).toBe(1230);
    expect(Money.parse('12', 'GBP').amountMinor).toBe(1200);
    expect(Money.parse('0.05', 'GBP').amountMinor).toBe(5);
    expect(Money.parse('500', 'JPY').amountMinor).toBe(500);
    expect(Money.parse('1.234', 'KWD').amountMinor).toBe(1234);
    expect(Money.parse('-19.99', 'USD').amountMinor).toBe(-1999);
  });

  it('is exact where floating point is not', () => {
    expect(Money.parse('0.29', 'GBP').amountMinor).toBe(29);
    expect(Money.parse('1.15', 'GBP').amountMinor).toBe(115);
    expect(Money.parse('4.35', 'GBP').amountMinor).toBe(435);
    expect(Money.parse('1234567.89', 'EUR').amountMinor).toBe(123456789);
  });

  it('rejects too many decimals and non-numbers instead of rounding them away', () => {
    for (const [text, currency] of [['12.345', 'GBP'], ['500.5', 'JPY'], ['1.2345', 'KWD'], ['abc', 'GBP'], ['1,000.00', 'GBP'], ['', 'GBP'], ['1e3', 'GBP'], ['.5', 'GBP']]) {
      expect(errorOf(() => Money.parse(text, currency))).toBeInstanceOf(RangeError);
    }
  });
});

describe('arithmetic', () => {
  it('adds, subtracts and negates, returning new values', () => {
    const a = gbp(1000);
    const b = gbp(250);
    expect(a.add(b).amountMinor).toBe(1250);
    expect(a.subtract(b).amountMinor).toBe(750);
    expect(b.subtract(a).amountMinor).toBe(-750);
    expect(a.negate().amountMinor).toBe(-1000);
    expect(a.amountMinor).toBe(1000);
  });

  it('refuses to mix currencies', () => {
    const e = errorOf(() => gbp(100).add(Money.of(100, 'USD')));
    expect(e).toBeInstanceOf(CurrencyMismatchError);
    expect(e.name).toBe('CurrencyMismatchError');
    expect(errorOf(() => gbp(100).subtract(Money.of(1, 'EUR')))).toBeInstanceOf(CurrencyMismatchError);
    expect(errorOf(() => gbp(100).compare(Money.of(1, 'EUR')))).toBeInstanceOf(CurrencyMismatchError);
  });

  it('multiplies by an integer quantity only', () => {
    expect(gbp(499).times(3).amountMinor).toBe(1497);
    expect(gbp(499).times(0).amountMinor).toBe(0);
    expect(errorOf(() => gbp(499).times(1.5))).toBeInstanceOf(RangeError);
  });

  it('takes a percentage in basis points, rounding half away from zero', () => {
    expect(gbp(199).percentage(2000).amountMinor).toBe(40);   // 39.8
    expect(gbp(1000).percentage(1750).amountMinor).toBe(175);
    expect(gbp(5).percentage(1000).amountMinor).toBe(1);      // 0.5 -> 1
    expect(gbp(-5).percentage(1000).amountMinor).toBe(-1);    // -0.5 -> -1, like the charge it refunds
    expect(gbp(-199).percentage(2000).amountMinor).toBe(-40);
    expect(gbp(4).percentage(1000).amountMinor).toBe(0);
    expect(gbp(335).percentage(3000).amountMinor).toBe(101);  // 100.5 exactly
  });

  it('never produces negative zero', () => {
    expect(Object.is(gbp(-4).percentage(1000).amountMinor, 0)).toBe(true);
    expect(Object.is(gbp(0).negate().amountMinor, 0)).toBe(true);
    expect(Object.is(gbp(5).times(0).amountMinor, 0)).toBe(true);
    expect(Object.is(gbp(-5).times(0).amountMinor, 0)).toBe(true);
  });

  it('sums a list, including an empty one', () => {
    expect(Money.sum([gbp(1), gbp(2), gbp(3)], 'GBP').amountMinor).toBe(6);
    expect(Money.sum([], 'JPY').equals(Money.zero('JPY'))).toBe(true);
    expect(errorOf(() => Money.sum([gbp(1), Money.of(1, 'USD')], 'GBP'))).toBeInstanceOf(CurrencyMismatchError);
  });
});

describe('comparison', () => {
  it('compares and tests equality by value', () => {
    expect(gbp(5).compare(gbp(7))).toBe(-1);
    expect(gbp(7).compare(gbp(5))).toBe(1);
    expect(gbp(5).compare(gbp(5))).toBe(0);
    expect(gbp(5).equals(gbp(5))).toBe(true);
    expect(gbp(5).equals(Money.of(5, 'USD'))).toBe(false);
    expect(gbp(5).equals({ amountMinor: 5, currency: 'GBP' })).toBe(false);
    expect(gbp(0).isZero()).toBe(true);
    expect(gbp(-1).isNegative()).toBe(true);
    expect(gbp(0).isNegative()).toBe(false);
  });
});

describe('toDecimalString', () => {
  it('formats exactly, per currency', () => {
    expect(gbp(1234).toDecimalString()).toBe('12.34');
    expect(gbp(5).toDecimalString()).toBe('0.05');
    expect(gbp(1990).toDecimalString()).toBe('19.90');
    expect(gbp(-5).toDecimalString()).toBe('-0.05');
    expect(gbp(0).toDecimalString()).toBe('0.00');
    expect(Money.of(500, 'JPY').toDecimalString()).toBe('500');
    expect(Money.of(1234, 'KWD').toDecimalString()).toBe('1.234');
    expect(Money.of(7, 'KWD').toDecimalString()).toBe('0.007');
  });

  it('round-trips with parse', () => {
    for (const text of ['0.01', '19.90', '-0.50', '1000000.00']) {
      expect(Money.parse(text, 'GBP').toDecimalString()).toBe(text);
    }
  });
});
