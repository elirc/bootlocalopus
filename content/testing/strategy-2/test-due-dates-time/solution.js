/** A `now` function frozen at one instant. */
const clockAt = (iso) => () => Date.parse(iso);
const label = (due, iso, timeZone = 'UTC') => solution.dueLabel(due, { now: clockAt(iso), timeZone });

describe('dueLabel', () => {
  it('labels today, tomorrow and later from a mid-afternoon clock', () => {
    expect(label('2031-03-10', '2031-03-10T15:00:00Z')).toBe('due today');
    expect(label('2031-03-11', '2031-03-10T15:00:00Z')).toBe('due tomorrow');
    expect(label('2031-03-14', '2031-03-10T15:00:00Z')).toBe('due in 4 days');
  });

  it('counts calendar days, not 24-hour periods, late in the evening', () => {
    expect(label('2031-03-11', '2031-03-10T23:59:00Z')).toBe('due tomorrow');
    expect(label('2031-03-12', '2031-03-10T23:59:00Z')).toBe('due in 2 days');
  });

  it('labels overdue tasks, singular and plural', () => {
    expect(label('2031-03-09', '2031-03-10T09:00:00Z')).toBe('overdue by 1 day');
    expect(label('2031-03-05', '2031-03-10T09:00:00Z')).toBe('overdue by 5 days');
  });

  it('works out today in the user\'s time zone, ahead of UTC', () => {
    // 20:00 UTC on 30 June is 05:00 on 1 July in Tokyo.
    expect(label('2031-07-01', '2031-06-30T20:00:00Z', 'Asia/Tokyo')).toBe('due today');
    expect(label('2031-06-30', '2031-06-30T20:00:00Z', 'Asia/Tokyo')).toBe('overdue by 1 day');
  });

  it('works out today in the user\'s time zone, behind UTC', () => {
    // 03:00 UTC on 11 March is still the evening of 10 March in Los Angeles.
    expect(label('2031-03-10', '2031-03-11T03:00:00Z', 'America/Los_Angeles')).toBe('due today');
    expect(label('2031-03-11', '2031-03-11T03:00:00Z', 'America/Los_Angeles')).toBe('due tomorrow');
  });

  it('counts across a month end and a year end', () => {
    expect(label('2032-03-01', '2032-02-28T12:00:00Z')).toBe('due in 2 days'); // 2032 is a leap year
    expect(label('2032-01-02', '2031-12-31T12:00:00Z')).toBe('due in 2 days');
  });

  it('uses the injected clock, not the real one', () => {
    // Years away from the real date: a bug reading Date.now() cannot agree by accident.
    expect(label('2001-01-02', '2001-01-01T12:00:00Z')).toBe('due tomorrow');
    expect(label('2099-01-01', '2099-01-01T12:00:00Z')).toBe('due today');
  });
});
