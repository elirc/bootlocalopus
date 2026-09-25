const { estimate } = solution;

const task = (name, best, likely, worst) => ({ name, best, likely, worst });
const CHECKOUT = () => [
  task('cart API', 1, 2, 4),
  task('checkout UI', 2, 3, 6),
  task('payment provider webhook', 0.5, 1, 5),
];

describe('estimate: the numbers', () => {
  it('matches the example from the brief', () => {
    expect(estimate(CHECKOUT())).toEqual({
      expectedDays: 7.5,
      p85Days: 8.5,
      p95Days: 9,
      spikes: ['payment provider webhook'],
      summary: 'Most likely about 7.5 days; 85% confident within 8.5 days, 95% within 9. Spike first: payment provider webhook.',
    });
  });

  it('expects more than the sum of the likely values for skewed tasks', () => {
    const r = estimate(CHECKOUT());
    const sumLikely = 2 + 3 + 1;
    expect(r.expectedDays).toBeGreaterThan(sumLikely);
  });

  it('adds variances, not standard deviations', () => {
    // Nine tasks, each sd 5/6: the project sd is 2.5 (sqrt of 9 × 25/36), not 7.5.
    const tasks = Array.from({ length: 9 }, (_, i) => task(`task ${i}`, 1, 2, 6));
    const r = estimate(tasks);
    expect(r.expectedDays).toBe(22.5);
    expect(r.p85Days).toBe(25.5);
    expect(r.p95Days).toBe(27);
  });

  it('stays well under the sum of the worst cases', () => {
    const tasks = Array.from({ length: 9 }, (_, i) => task(`task ${i}`, 1, 2, 6));
    expect(estimate(tasks).p95Days).toBeLessThan(9 * 6);
  });

  it('gives a single range of zero width for a certain task', () => {
    expect(estimate([task('rename a button', 2, 2, 2)])).toEqual({
      expectedDays: 2,
      p85Days: 2,
      p95Days: 2,
      spikes: [],
      summary: 'Most likely about 2 days; 85% confident within 2 days, 95% within 2.',
    });
  });

  it('rounds up to the next half day', () => {
    const r = estimate([task('x', 1, 2, 10), task('y', 0, 0, 1)]);
    // mean 3.33, p85 4.90, p95 5.82
    expect([r.expectedDays, r.p85Days, r.p95Days]).toEqual([3.5, 5, 6]);
  });

  it('leaves a value that is already on a half day alone, despite floating point', () => {
    // Five tasks of 0.7 days: the float sum is 3.5000000000000004, which must still be 3.5.
    const five = Array.from({ length: 5 }, (_, i) => task(`t${i}`, 0.7, 0.7, 0.7));
    expect(estimate(five).expectedDays).toBe(3.5);
    const ten = Array.from({ length: 10 }, (_, i) => task(`t${i}`, 0.7, 0.7, 0.7));
    expect(estimate(ten).expectedDays).toBe(7);
  });
});

describe('estimate: spikes and the summary', () => {
  it('lists tasks whose worst is more than three times their likely, in input order', () => {
    const r = estimate([task('search', 1, 2, 10), task('login', 1, 2, 6), task('import', 0, 0, 1), task('noop', 0, 0, 0)]);
    expect(r.spikes).toEqual(['search', 'import']);
  });

  it('leaves the spike sentence out when there is nothing to spike', () => {
    const r = estimate([task('a', 1, 2, 3), task('b', 1, 1, 2)]);
    expect(r.spikes).toEqual([]);
    expect(r.summary).toBe(`Most likely about ${r.expectedDays} days; 85% confident within ${r.p85Days} days, 95% within ${r.p95Days}.`);
  });

  it('joins several spikes with commas', () => {
    expect(estimate([task('x', 1, 2, 10), task('y', 0, 0, 1)]).summary).toBe(
      'Most likely about 3.5 days; 85% confident within 5 days, 95% within 6. Spike first: x, y.',
    );
  });
});

describe('estimate: validation', () => {
  it('throws a RangeError for an empty list', () => {
    expect(() => estimate([])).toThrow(RangeError);
  });

  it('throws a RangeError when the three values are out of order or negative', () => {
    expect(() => estimate([task('a', 3, 2, 5)])).toThrow(RangeError);
    expect(() => estimate([task('a', 1, 4, 3)])).toThrow(RangeError);
    expect(() => estimate([task('a', -1, 2, 3)])).toThrow(RangeError);
    expect(() => estimate([...CHECKOUT(), task('typo', 1, 5, 2)])).toThrow(RangeError);
  });

  it('throws a RangeError for values that are not numbers', () => {
    expect(() => estimate([task('a', 1, '2', 3)])).toThrow(RangeError);
    expect(() => estimate([task('a', 1, 2, undefined)])).toThrow(RangeError);
    expect(() => estimate([task('a', NaN, 2, 3)])).toThrow(RangeError);
  });
});
