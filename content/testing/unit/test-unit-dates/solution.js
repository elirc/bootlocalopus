// Fixed dates only. Weekdays looked up once:
const FRI = '2024-03-01';
const SAT = '2024-03-02';
const SUN = '2024-03-03';
const MON = '2024-03-04';

describe('addBusinessDays: weekends', () => {
  const cases = [
    // [start, n, expected, why]
    [MON, 1, '2024-03-05', 'mid-week'],
    [FRI, 1, MON, 'Friday + 1 skips the weekend'],
    [FRI, 5, '2024-03-08', 'a whole working week'],
    [SAT, 1, MON, 'the start day never counts, even on a weekend'],
    [SUN, 1, MON, 'Sunday + 1 is Monday'],
    [MON, -1, FRI, 'Monday - 1 is the Friday before'],
    [SUN, -1, FRI, 'backwards from a weekend'],
  ];
  for (const [start, n, expected, why] of cases) {
    it(`${start} ${n >= 0 ? '+' : ''}${n} is ${expected} (${why})`, () => {
      expect(solution.addBusinessDays(start, n)).toBe(expected);
    });
  }
});

describe('addBusinessDays: calendar edges', () => {
  it('crosses a leap-year month end', () => {
    expect(solution.addBusinessDays('2024-02-29', 2)).toBe('2024-03-04');
  });

  it('crosses a year end', () => {
    expect(solution.addBusinessDays('2024-12-31', 3)).toBe('2025-01-03');
  });
});

describe('addBusinessDays: holidays', () => {
  const holidays = ['2024-12-25', '2024-12-26'];

  it('skips holidays that fall on weekdays', () => {
    expect(solution.addBusinessDays('2024-12-24', 1, { holidays })).toBe('2024-12-27');
  });

  it('skips holidays going backwards too', () => {
    expect(solution.addBusinessDays('2024-12-27', -1, { holidays })).toBe('2024-12-24');
  });

  it('a holiday only matters if it is listed', () => {
    expect(solution.addBusinessDays('2024-12-24', 1)).toBe('2024-12-25');
  });
});

describe('addBusinessDays: n = 0', () => {
  it('returns the date unchanged, even on a weekend', () => {
    expect(solution.addBusinessDays(SAT, 0)).toBe(SAT);
    expect(solution.addBusinessDays(MON, 0)).toBe(MON);
  });
});
