// 2024-03-04 is a Monday. Mid-week tests are easy to write. Are they enough?

describe('addBusinessDays', () => {
  it('adds one day on a Monday', () => {
    expect(solution.addBusinessDays('2024-03-04', 1)).toBe('2024-03-05');
  });

  it('adds two days on a Monday', () => {
    expect(solution.addBusinessDays('2024-03-04', 2)).toBe('2024-03-06');
  });

  // TODO: Fridays, weekends, going backwards, holidays, month and year ends, n = 0.
});
