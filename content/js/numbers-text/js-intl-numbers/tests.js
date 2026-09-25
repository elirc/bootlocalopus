const { formatPercent, formatBytes, parseLocaleNumber } = solution;

const NBSP = ' ';
const NNBSP = ' ';

describe('formatPercent', () => {
  it('formats a ratio as a percentage (multiplying once, not twice)', () => {
    expect(formatPercent(0.256, 'en')).toBe('26%');
    expect(formatPercent(1.5, 'en')).toBe('150%');
    expect(formatPercent(0, 'en')).toBe('0%');
  });

  it('uses the locale\'s decimal separator and spacing', () => {
    expect(formatPercent(0.2567, 'de', { digits: 1 })).toBe(`25,7${NBSP}%`);
    expect(formatPercent(0.2567, 'en', { digits: 1 })).toBe('25.7%');
  });

  it('shows at most `digits` fraction digits, without padding', () => {
    expect(formatPercent(0.25, 'en', { digits: 1 })).toBe('25%');
    expect(formatPercent(0.12345, 'en', { digits: 2 })).toBe('12.35%');
  });

  it('signed: + for gains, - for losses, no sign for zero', () => {
    expect(formatPercent(0.125, 'en', { signed: true, digits: 1 })).toBe('+12.5%');
    expect(formatPercent(-0.03, 'en', { signed: true })).toBe('-3%');
    expect(formatPercent(0, 'en', { signed: true })).toBe('0%');
    expect(formatPercent(0.125, 'de', { signed: true, digits: 1 })).toBe(`+12,5${NBSP}%`);
  });

  it('signed: no sign on a value that rounds to zero', () => {
    expect(formatPercent(-0.0001, 'en', { signed: true })).toBe('0%');
    expect(formatPercent(0.0001, 'en', { signed: true })).toBe('0%');
  });

  it('unsigned by default', () => {
    expect(formatPercent(0.125, 'en', { digits: 1 })).toBe('12.5%');
  });
});

describe('formatBytes', () => {
  it('keeps small values in bytes', () => {
    expect(formatBytes(0, 'en')).toBe('0 byte');
    expect(formatBytes(1, 'en')).toBe('1 byte');
    expect(formatBytes(999, 'en')).toBe('999 byte');
  });

  it('uses decimal units with one fraction digit at most', () => {
    expect(formatBytes(1000, 'en')).toBe('1 kB');
    expect(formatBytes(1536, 'en')).toBe('1.5 kB');
    expect(formatBytes(3_200_000_000_000, 'en')).toBe('3.2 TB');
    expect(formatBytes(9_000_000_000_000_000, 'en')).toBe('9 PB');
  });

  it('moves up a unit when rounding would reach 1000', () => {
    expect(formatBytes(999_949, 'en')).toBe('999.9 kB');
    expect(formatBytes(999_950, 'en')).toBe('1 MB');
    expect(formatBytes(999_999_999, 'en')).toBe('1 GB');
    expect(formatBytes(999_960, 'en')).toBe('1 MB');
  });

  it('localises the number and the unit', () => {
    expect(formatBytes(1_500_000, 'de')).toBe('1,5 MB');
    expect(formatBytes(2_000_000_000, 'fr')).toBe(`2${NNBSP}Go`);
  });

  it('rejects negative, fractional and unsafe values', () => {
    expect(() => formatBytes(-1, 'en')).toThrow(RangeError);
    expect(() => formatBytes(1.5, 'en')).toThrow(RangeError);
    expect(() => formatBytes(2 ** 53, 'en')).toThrow(RangeError);
  });
});

describe('parseLocaleNumber', () => {
  it('reads each locale\'s own separators', () => {
    expect(parseLocaleNumber('1,234.5', 'en')).toBe(1234.5);
    expect(parseLocaleNumber('1.234,5', 'de')).toBe(1234.5);
    expect(parseLocaleNumber(`1${NNBSP}234,5`, 'fr')).toBe(1234.5);
    expect(parseLocaleNumber('1\'234.5', 'de-CH')).toBe(1234.5);
  });

  it('means different things in different locales', () => {
    expect(parseLocaleNumber('1.234', 'en')).toBe(1.234);
    expect(parseLocaleNumber('1.234', 'de')).toBe(1234);
    expect(parseLocaleNumber('1,5', 'de')).toBe(1.5);
  });

  it('accepts a plain space where the locale groups with a special space', () => {
    expect(parseLocaleNumber('1 234 567,25', 'fr')).toBe(1234567.25);
    expect(parseLocaleNumber('1 234,5', 'pl')).toBe(1234.5);
    expect(parseLocaleNumber(`1${NBSP}234,5`, 'pl')).toBe(1234.5);
  });

  it('accepts plain digits, negatives and surrounding whitespace', () => {
    expect(parseLocaleNumber('  -1234,75 ', 'de')).toBe(-1234.75);
    expect(parseLocaleNumber('42', 'en')).toBe(42);
    expect(parseLocaleNumber('-0.5', 'en')).toBe(-0.5);
  });

  it('round-trips what Intl formats', () => {
    for (const locale of ['en', 'de', 'fr', 'de-CH', 'es', 'pl', 'it']) {
      for (const n of [0.5, 12, 1234.5, -987654.25, 1234567.125]) {
        const text = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(n);
        expect(parseLocaleNumber(text, locale)).toBe(n);
      }
    }
  });

  it('returns NaN for anything malformed', () => {
    const bad = [
      ['', 'en'], ['abc', 'en'], ['12abc', 'en'], ['12,5', 'en'], ['1,23,456', 'en'],
      ['1.2.3', 'en'], ['1,234.5', 'de'], ['1.234.5', 'de'], ['1,2,3', 'de'], [',5', 'de'],
      ['5,', 'de'], ['--1', 'en'], ['1e3', 'en'], ['1 234', 'en'], ['Infinity', 'en'],
    ];
    for (const [text, locale] of bad) {
      expect([text, locale, parseLocaleNumber(text, locale)]).toEqual([text, locale, NaN]);
    }
  });
});
