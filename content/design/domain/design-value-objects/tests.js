const { EmailAddress, DateRange, InvalidValueError } = solution;
const attempt = (fn) => { try { fn(); } catch { /* frozen or getter-only: fine */ } };
const errorOf = (fn) => { try { fn(); } catch (e) { return e; } return null; };

describe('EmailAddress', () => {
  it('normalises on the way in', () => {
    const e = EmailAddress.parse('  Ada.Lovelace@Example.COM ');
    expect(e.value).toBe('ada.lovelace@example.com');
    expect(e.domain).toBe('example.com');
    expect(String(e)).toBe('ada.lovelace@example.com');
    expect(`${e}`).toBe('ada.lovelace@example.com');
  });

  it('rejects anything that is not an email, with InvalidValueError', () => {
    for (const bad of ['', 'ada', 'ada@', '@example.com', 'ada@example', 'ada lovelace@example.com', 42, null, undefined]) {
      const err = errorOf(() => EmailAddress.parse(bad));
      expect(err).toBeInstanceOf(InvalidValueError);
      expect(err.name).toBe('InvalidValueError');
    }
  });

  it('is equal by value, not by identity', () => {
    const a = EmailAddress.parse('ada@example.com');
    const b = EmailAddress.parse('ADA@example.com ');
    expect(a === b).toBe(false);
    expect(a.equals(b)).toBe(true);
    expect(b.equals(a)).toBe(true);
    expect(a.equals(EmailAddress.parse('bob@example.com'))).toBe(false);
  });

  it('is not equal to a plain string or a look-alike object', () => {
    const a = EmailAddress.parse('ada@example.com');
    expect(a.equals('ada@example.com')).toBe(false);
    expect(a.equals({ value: 'ada@example.com' })).toBe(false);
    expect(a.equals(null)).toBe(false);
  });

  it('serialises as a plain string', () => {
    expect(JSON.stringify({ email: EmailAddress.parse('Ada@Example.com') })).toBe('{"email":"ada@example.com"}');
  });

  it('cannot be changed after creation', () => {
    const a = EmailAddress.parse('ada@example.com');
    attempt(() => { a.value = 'eve@evil.com'; });
    attempt(() => { a.domain = 'evil.com'; });
    expect(a.value).toBe('ada@example.com');
    expect(a.domain).toBe('example.com');
  });
});

describe('DateRange', () => {
  it('counts nights across month ends and leap days', () => {
    expect(DateRange.of('2024-01-30', '2024-02-02').nights).toBe(3);
    expect(DateRange.of('2024-02-28', '2024-03-01').nights).toBe(2);
    expect(DateRange.of('2023-02-28', '2023-03-01').nights).toBe(1);
    expect(DateRange.of('2024-03-30', '2024-04-02').nights).toBe(3);
    expect(DateRange.of('2024-10-26', '2024-10-28').nights).toBe(2);
  });

  it('exposes its dates', () => {
    const r = DateRange.of('2024-05-01', '2024-05-04');
    expect(r.start).toBe('2024-05-01');
    expect(r.end).toBe('2024-05-04');
    expect(JSON.parse(JSON.stringify(r))).toEqual({ start: '2024-05-01', end: '2024-05-04' });
  });

  it('refuses to exist in an invalid state', () => {
    const bad = [
      ['2024-05-04', '2024-05-01'],
      ['2024-05-01', '2024-05-01'],
      ['2024-02-30', '2024-03-02'],
      ['2023-02-29', '2023-03-02'],
      ['2024-13-01', '2024-13-05'],
      ['2024-5-1', '2024-05-04'],
      ['2024-05-01T00:00:00Z', '2024-05-04'],
      ['2024-05-01', null],
      [new Date('2024-05-01'), '2024-05-04'],
    ];
    for (const [start, end] of bad) {
      expect(errorOf(() => DateRange.of(start, end))).toBeInstanceOf(InvalidValueError);
    }
  });

  it('contains its first night but not the check-out day', () => {
    const r = DateRange.of('2024-05-01', '2024-05-04');
    expect(r.contains('2024-04-30')).toBe(false);
    expect(r.contains('2024-05-01')).toBe(true);
    expect(r.contains('2024-05-03')).toBe(true);
    expect(r.contains('2024-05-04')).toBe(false);
  });

  it('back-to-back stays do not overlap; any shared night does', () => {
    const r = DateRange.of('2024-05-01', '2024-05-04');
    expect(r.overlaps(DateRange.of('2024-05-04', '2024-05-06'))).toBe(false);
    expect(r.overlaps(DateRange.of('2024-04-28', '2024-05-01'))).toBe(false);
    expect(r.overlaps(DateRange.of('2024-05-03', '2024-05-06'))).toBe(true);
    expect(r.overlaps(DateRange.of('2024-04-28', '2024-05-02'))).toBe(true);
    expect(r.overlaps(DateRange.of('2024-05-02', '2024-05-03'))).toBe(true);
    expect(r.overlaps(DateRange.of('2024-04-01', '2024-06-01'))).toBe(true);
    expect(DateRange.of('2024-05-02', '2024-05-03').overlaps(r)).toBe(true);
  });

  it('is equal by value', () => {
    expect(DateRange.of('2024-05-01', '2024-05-04').equals(DateRange.of('2024-05-01', '2024-05-04'))).toBe(true);
    expect(DateRange.of('2024-05-01', '2024-05-04').equals(DateRange.of('2024-05-01', '2024-05-05'))).toBe(false);
    expect(DateRange.of('2024-05-01', '2024-05-04').equals({ start: '2024-05-01', end: '2024-05-04' })).toBe(false);
  });

  it('changes by returning a new, validated value', () => {
    const r = DateRange.of('2024-05-01', '2024-05-04');
    const longer = r.withEnd('2024-05-06');
    expect(longer.nights).toBe(5);
    expect(r.nights).toBe(3);
    expect(r.end).toBe('2024-05-04');
    expect(errorOf(() => r.withEnd('2024-04-30'))).toBeInstanceOf(InvalidValueError);
  });

  it('cannot be mutated', () => {
    const r = DateRange.of('2024-05-01', '2024-05-04');
    attempt(() => { r.start = '2024-06-01'; });
    attempt(() => { r.end = '2023-01-01'; });
    expect([r.start, r.end, r.nights]).toEqual(['2024-05-01', '2024-05-04', 3]);
  });
});
