const MIN = 60_000;
const NOW = Date.UTC(2025, 2, 10, 12, 0, 0);
const DAY = 24 * 60 * MIN;

/** One bucket per minute for the `minutes` before `end`, each with `total` and `errors`. */
function minutes(count, { total, errors, end = NOW }) {
  return Array.from({ length: count }, (_, i) => ({ start: end - (i + 1) * MIN, total, errors }));
}

const slo = (buckets, objective = 0.999) => solution.evaluateSlo({ objective }, buckets, NOW);

describe('ratios', () => {
  it('computes the SLI and remaining budget over the whole window', () => {
    // 30 days of steady traffic with a 0.05% error ratio: half the budget spent.
    const buckets = [{ start: NOW - 20 * DAY, total: 2_000_000, errors: 1_000 }];
    const r = slo(buckets);
    expect(r.sli).toBeCloseTo(0.9995, 10);
    expect(r.budgetRemaining).toBeCloseTo(0.5, 10);
    expect(r.burnRates['1h']).toBe(0);
    expect(r.alert).toBeNull();
  });

  it('divides total errors by total requests, never averages per-bucket ratios', () => {
    const buckets = [
      { start: NOW - 2 * MIN, total: 2, errors: 1 },          // a quiet minute: 50%
      { start: NOW - 1 * MIN, total: 9998, errors: 9 },       // a busy one: 0.09%
    ];
    const r = slo(buckets);
    expect(r.sli).toBeCloseTo(1 - 10 / 10000, 10);
    expect(r.burnRates['5m']).toBeCloseTo((10 / 10000) / 0.001, 6);
  });

  it('treats windows without traffic as error ratio 0', () => {
    const r = slo([]);
    expect(r).toStrictEqual({ sli: 1, budgetRemaining: 1, burnRates: { '5m': 0, '30m': 0, '1h': 0, '6h': 0 }, alert: null });
  });

  it('goes negative once the budget is overspent', () => {
    const r = slo([{ start: NOW - 3 * DAY, total: 1000, errors: 3 }]);
    expect(r.budgetRemaining).toBeCloseTo(-2, 10);
  });
});

describe('windows', () => {
  it('includes a bucket starting exactly now - w and excludes one starting at now', () => {
    const buckets = [
      { start: NOW - 5 * MIN, total: 100, errors: 10 },
      { start: NOW, total: 100, errors: 100 },
      { start: NOW - 30 * DAY - 1, total: 1000, errors: 1000 },
    ];
    const r = slo(buckets);
    expect(r.burnRates['5m']).toBeCloseTo(100, 6);
    expect(r.sli).toBeCloseTo(0.9, 10);
  });

  it('computes each burn rate over its own window, with buckets in any order', () => {
    const buckets = [
      ...minutes(300, { total: 1000, errors: 0, end: NOW - 60 * MIN }), // hours 1-6: clean
      ...minutes(55, { total: 1000, errors: 1, end: NOW - 5 * MIN }),   // minutes 5-60: 0.1%
      ...minutes(5, { total: 1000, errors: 20 }),                       // last 5 minutes: 2%
    ].reverse();
    const r = slo(buckets);
    expect(r.burnRates['5m']).toBeCloseTo(20, 6);
    expect(r.burnRates['30m']).toBeCloseTo(((25 * 1) + (5 * 20)) / 30, 6);
    expect(r.burnRates['1h']).toBeCloseTo(((55 * 1) + (5 * 20)) / 60, 6);
    expect(r.burnRates['6h']).toBeCloseTo(((55 * 1) + (5 * 20)) / 360, 6);
  });

  it('honours a custom SLO window', () => {
    const r = solution.evaluateSlo({ objective: 0.99, windowMs: 7 * DAY }, [
      { start: NOW - 8 * DAY, total: 100, errors: 100 },
      { start: NOW - 1 * DAY, total: 100, errors: 1 },
    ], NOW);
    expect(r.sli).toBeCloseTo(0.99, 10);
    expect(r.budgetRemaining).toBeCloseTo(0, 10);
  });
});

describe('alerts', () => {
  it('pages on a fast burn that is still happening', () => {
    const r = slo(minutes(60, { total: 1000, errors: 20 }));   // 2% for an hour: burn 20
    expect(r.alert).toBe('page');
  });

  it('does not page for a fast burn that already stopped', () => {
    const buckets = [
      ...minutes(50, { total: 1000, errors: 30, end: NOW - 10 * MIN }),
      ...minutes(10, { total: 1000, errors: 0 }),
    ];
    const r = slo(buckets);
    expect(r.burnRates['1h']).toBeGreaterThan(14.4);
    expect(r.burnRates['5m']).toBe(0);
    expect(r.alert).not.toBe('page');
  });

  it('does not page for a two-minute blip', () => {
    const buckets = [...minutes(58, { total: 1000, errors: 0, end: NOW - 2 * MIN }), ...minutes(2, { total: 1000, errors: 100 })];
    const r = slo(buckets);
    expect(r.burnRates['5m']).toBeGreaterThan(14.4);
    expect(r.burnRates['1h']).toBeLessThan(14.4);
    expect(r.alert).toBeNull();
  });

  it('opens a ticket on a slow burn', () => {
    const r = slo(minutes(360, { total: 1000, errors: 7 }));   // 0.7% for 6 hours: burn 7
    expect(r.alert).toBe('ticket');
  });

  it('needs both windows over the threshold, not just one', () => {
    expect(slo(minutes(60, { total: 1000, errors: 15 })).alert).toBe('page');   // burn 15
    expect(slo(minutes(60, { total: 1000, errors: 14 })).alert).toBe('ticket'); // burn 14: slow, not fast
    // A slow burn only in the last half hour, clean before: 30m is 8, 6h is 0.67.
    const recent = [...minutes(330, { total: 1000, errors: 0, end: NOW - 30 * MIN }), ...minutes(30, { total: 1000, errors: 8 })];
    expect(slo(recent).alert).toBeNull();
  });
});

describe('validation', () => {
  it('rejects bad objectives and impossible buckets', () => {
    for (const objective of [0, 1, 1.5, -0.1, '0.99', NaN]) {
      expect(() => solution.evaluateSlo({ objective }, [], NOW)).toThrow(RangeError);
    }
    for (const b of [{ total: 1, errors: 2 }, { total: 5, errors: -1 }, { total: 1.5, errors: 0 }, { total: 10, errors: '1' }]) {
      expect(() => slo([{ start: NOW - MIN, ...b }])).toThrow(RangeError);
    }
  });
});
