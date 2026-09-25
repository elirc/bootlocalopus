// Your tests run against the correct dueLabel, a rewrite, and five bugs.

/** A `now` function frozen at one instant. */
const clockAt = (iso) => () => Date.parse(iso);

describe('dueLabel', () => {
  it('says due tomorrow for tomorrow', () => {
    const now = clockAt('2024-03-10T00:00:00Z');
    expect(solution.dueLabel('2024-03-11', { now, timeZone: 'UTC' })).toBe('due tomorrow');
  });

  // TODO: evening instants, a time zone far from UTC, a month end, overdue.
});
