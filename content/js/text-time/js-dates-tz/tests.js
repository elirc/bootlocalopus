const { startOfDayInZone, sameTimeTomorrow, addMonths, parseInstant, formatPrice } = solution;

const LON = 'Europe/London';
const NY = 'America/New_York';
const iso = (d) => {
  expect(d).toBeInstanceOf(Date);
  return d.toISOString();
};
const throwsRange = (fn) => {
  let caught;
  try { fn(); } catch (e) { caught = e; }
  expect(caught).toBeInstanceOf(RangeError);
};

describe('startOfDayInZone', () => {
  it('London, an ordinary summer day: midnight BST is 23:00 UTC the day before', () => {
    expect(iso(startOfDayInZone(new Date('2025-07-02T10:00:00Z'), LON))).toBe('2025-07-01T23:00:00.000Z');
  });
  it('uses the zone\'s calendar day, not the UTC one (00:30 BST on 2 July is still 1 July in UTC)', () => {
    expect(iso(startOfDayInZone(new Date('2025-07-01T23:30:00Z'), LON))).toBe('2025-07-01T23:00:00.000Z');
  });
  it('London, spring-forward day: the day began in GMT even though it is BST by noon', () => {
    expect(iso(startOfDayInZone(new Date('2025-03-30T12:00:00Z'), LON))).toBe('2025-03-30T00:00:00.000Z');
  });
  it('London, fall-back day: the day began in BST even though it is GMT by noon', () => {
    expect(iso(startOfDayInZone(new Date('2025-10-26T12:00:00Z'), LON))).toBe('2025-10-25T23:00:00.000Z');
  });
  it('New York, spring-forward day began at 05:00 UTC (EST)', () => {
    expect(iso(startOfDayInZone(new Date('2025-03-09T20:00:00Z'), NY))).toBe('2025-03-09T05:00:00.000Z');
  });
  it('New York, fall-back day began at 04:00 UTC (EDT)', () => {
    expect(iso(startOfDayInZone(new Date('2025-11-02T20:00:00Z'), NY))).toBe('2025-11-02T04:00:00.000Z');
  });
  it('New York late evening belongs to the previous UTC date', () => {
    expect(iso(startOfDayInZone(new Date('2025-06-15T02:00:00Z'), NY))).toBe('2025-06-14T04:00:00.000Z');
  });
  it('handles half-hour offsets (Asia/Kolkata, UTC+05:30)', () => {
    expect(iso(startOfDayInZone(new Date('2025-01-01T20:00:00Z'), 'Asia/Kolkata'))).toBe('2025-01-01T18:30:00.000Z');
  });
  it('does not mutate its argument', () => {
    const d = new Date('2025-07-02T10:00:00Z');
    startOfDayInZone(d, LON);
    expect(d.toISOString()).toBe('2025-07-02T10:00:00.000Z');
  });
});

describe('sameTimeTomorrow', () => {
  it('an ordinary day is exactly 24 hours, milliseconds preserved', () => {
    expect(iso(sameTimeTomorrow(new Date('2025-06-10T08:15:30.250Z'), LON))).toBe('2025-06-11T08:15:30.250Z');
  });
  it('New York 09:00 EST -> 09:00 EDT the next day is 23 hours later', () => {
    expect(iso(sameTimeTomorrow(new Date('2025-03-08T14:00:00Z'), NY))).toBe('2025-03-09T13:00:00.000Z');
  });
  it('New York 09:00 EDT -> 09:00 EST the next day is 25 hours later', () => {
    expect(iso(sameTimeTomorrow(new Date('2025-11-01T13:00:00Z'), NY))).toBe('2025-11-02T14:00:00.000Z');
  });
  it('London 09:00 GMT -> 09:00 BST across spring forward', () => {
    expect(iso(sameTimeTomorrow(new Date('2025-03-29T09:00:00Z'), LON))).toBe('2025-03-30T08:00:00.000Z');
  });
  it('London 09:00 BST -> 09:00 GMT across fall back', () => {
    expect(iso(sameTimeTomorrow(new Date('2025-10-25T08:00:00Z'), LON))).toBe('2025-10-26T09:00:00.000Z');
  });
  it('crosses a month boundary in the zone (31 Jan -> 1 Feb)', () => {
    expect(iso(sameTimeTomorrow(new Date('2025-01-31T17:00:00Z'), NY))).toBe('2025-02-01T17:00:00.000Z');
  });
  it('a wall time in the New York spring gap moves forward by the gap (02:30 -> 03:30 EDT)', () => {
    expect(iso(sameTimeTomorrow(new Date('2025-03-08T07:30:00Z'), NY))).toBe('2025-03-09T07:30:00.000Z');
  });
  it('a wall time in the London spring gap moves forward by the gap (01:30 -> 02:30 BST)', () => {
    expect(iso(sameTimeTomorrow(new Date('2025-03-29T01:30:00Z'), LON))).toBe('2025-03-30T01:30:00.000Z');
  });
  it('an ambiguous New York wall time takes the earlier instant (01:30 EDT)', () => {
    expect(iso(sameTimeTomorrow(new Date('2025-11-01T05:30:00Z'), NY))).toBe('2025-11-02T05:30:00.000Z');
  });
  it('an ambiguous London wall time takes the earlier instant (01:30 BST)', () => {
    expect(iso(sameTimeTomorrow(new Date('2025-10-25T00:30:00Z'), LON))).toBe('2025-10-26T00:30:00.000Z');
  });
});

describe('addMonths', () => {
  it('clamps 31 January to the end of February', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
  });
  it('keeps the day when the target month has it', () => {
    expect(addMonths('2025-01-31', 2)).toBe('2025-03-31');
    expect(addMonths('2025-05-15', 1)).toBe('2025-06-15');
  });
  it('rolls the year forwards and backwards', () => {
    expect(addMonths('2025-12-15', 1)).toBe('2026-01-15');
    expect(addMonths('2025-11-30', 3)).toBe('2026-02-28');
    expect(addMonths('2025-01-15', -13)).toBe('2023-12-15');
  });
  it('handles negative n with clamping', () => {
    expect(addMonths('2025-03-31', -1)).toBe('2025-02-28');
  });
  it('n = 0 returns the same date', () => {
    expect(addMonths('2025-04-30', 0)).toBe('2025-04-30');
  });
  it('clamping is not reversible (why you add from the anchor date)', () => {
    expect(addMonths(addMonths('2025-01-31', 1), 1)).toBe('2025-03-28');
  });
  it('rejects dates that do not exist or are not YYYY-MM-DD', () => {
    throwsRange(() => addMonths('2025-02-30', 1));
    throwsRange(() => addMonths('2025-13-01', 1));
    throwsRange(() => addMonths('2025-1-5', 1));
    throwsRange(() => addMonths('yesterday', 1));
  });
});

describe('parseInstant', () => {
  it('round-trips a UTC string exactly', () => {
    for (const s of ['2025-03-30T11:00:00.000Z', '2024-02-29T23:59:59.999Z', '1999-12-31T00:00:00.000Z']) {
      expect(iso(parseInstant(s))).toBe(s);
    }
  });
  it('applies an explicit offset', () => {
    expect(iso(parseInstant('2025-03-30T12:00:00+01:00'))).toBe('2025-03-30T11:00:00.000Z');
    expect(iso(parseInstant('2025-11-02T01:30:00-05:00'))).toBe('2025-11-02T06:30:00.000Z');
    expect(iso(parseInstant('2025-01-01T00:00:00+05:30'))).toBe('2024-12-31T18:30:00.000Z');
  });
  it('seconds and fractions are optional', () => {
    expect(iso(parseInstant('2025-03-30T12:00Z'))).toBe('2025-03-30T12:00:00.000Z');
    expect(iso(parseInstant('2025-03-30T12:00:00.25Z'))).toBe('2025-03-30T12:00:00.250Z');
  });
  it('rejects a date-time with no offset (it would be read as server-local time)', () => {
    throwsRange(() => parseInstant('2025-03-30T12:00:00'));
    throwsRange(() => parseInstant('2025-03-30T12:00'));
  });
  it('rejects a bare date and non-dates', () => {
    throwsRange(() => parseInstant('2025-03-30'));
    throwsRange(() => parseInstant('March 30, 2025 12:00 GMT'));
    throwsRange(() => parseInstant(''));
    throwsRange(() => parseInstant('not a date'));
  });
  it('rejects a date-time that does not exist instead of rolling it over', () => {
    throwsRange(() => parseInstant('2025-02-30T10:00:00Z'));
    throwsRange(() => parseInstant('2025-02-29T10:00:00+01:00'));
    throwsRange(() => parseInstant('2025-04-31T00:00:00Z'));
  });
});

describe('formatPrice', () => {
  const intl = (major, currency, locale) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(major);

  it('USD and GBP have two decimals', () => {
    expect(formatPrice(1999, 'USD', 'en-US')).toBe('$19.99');
    expect(formatPrice(5, 'USD', 'en-US')).toBe('$0.05');
    expect(formatPrice(1999, 'GBP', 'en-GB')).toBe('£19.99');
  });
  it('respects the locale\'s separators and symbol placement', () => {
    expect(formatPrice(1999, 'EUR', 'de-DE')).toBe('19,99 €');
    expect(formatPrice(123456789, 'EUR', 'fr-FR')).toBe(intl(1234567.89, 'EUR', 'fr-FR'));
  });
  it('JPY has no minor unit: 1500 is ¥1,500, not ¥15.00', () => {
    expect(formatPrice(1500, 'JPY', 'en-US')).toBe('¥1,500');
    expect(formatPrice(1500, 'JPY', 'ja-JP')).toBe(intl(1500, 'JPY', 'ja-JP'));
  });
  it('KWD has three decimals', () => {
    expect(formatPrice(1234, 'KWD', 'en-US')).toBe(intl(1.234, 'KWD', 'en-US'));
    expect(formatPrice(1, 'KWD', 'en-US')).toBe(intl(0.001, 'KWD', 'en-US'));
  });
  it('formats negatives (refunds)', () => {
    expect(formatPrice(-500, 'USD', 'en-US')).toBe('-$5.00');
  });
  it('rejects a non-integer amount', () => {
    throwsRange(() => formatPrice(19.99, 'USD', 'en-US'));
    throwsRange(() => formatPrice(NaN, 'USD', 'en-US'));
  });
});
