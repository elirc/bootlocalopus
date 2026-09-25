const make = (buckets, now) => solution.createHistogram({ buckets, now });

describe('observing', () => {
  it('counts cumulatively, inclusive of the upper bound, with +Inf last', () => {
    const h = make([0.1, 0.5, 1]);
    for (const v of [0.05, 0.1, 0.3, 0.5, 0.7, 3]) h.observe(v);
    const s = h.snapshot();
    expect(Object.keys(s).sort()).toEqual(['buckets', 'count', 'sum']);
    expect(s.buckets).toStrictEqual([{ le: 0.1, count: 2 }, { le: 0.5, count: 4 }, { le: 1, count: 5 }, { le: '+Inf', count: 6 }]);
    expect(s.count).toBe(6);
    expect(s.sum).toBeCloseTo(4.65, 10);
  });

  it('uses the default buckets', () => {
    const h = solution.createHistogram();
    h.observe(0.02);
    const s = h.snapshot();
    expect(s.buckets.map((b) => b.le)).toEqual([0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, '+Inf']);
    expect(s.buckets.map((b) => b.count)).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('returns fresh snapshots', () => {
    const h = make([1]);
    h.observe(0.5);
    const s = h.snapshot();
    s.buckets[0].count = 99;
    s.count = 99;
    expect(h.snapshot().buckets[0].count).toBe(1);
    expect(h.snapshot().count).toBe(1);
  });

  it('refuses non-finite observations', () => {
    const h = make([1]);
    for (const bad of [NaN, Infinity, -Infinity, '0.2', undefined]) expect(() => h.observe(bad)).toThrow(RangeError);
    expect(h.snapshot().count).toBe(0);
  });

  it('refuses buckets that are empty, unsorted, repeated or not finite', () => {
    for (const bad of [[], [0.5, 0.1], [0.1, 0.1], [0.1, Infinity], [0.1, '1'], [NaN]]) {
      expect(() => solution.createHistogram({ buckets: bad })).toThrow(RangeError);
    }
  });
});

describe('timing', () => {
  it('observes elapsed seconds from the injected millisecond clock, once', () => {
    const clock = { t: 10_000 };
    const h = make([0.1, 0.5, 1], () => clock.t);
    const end = h.startTimer();
    clock.t += 250;
    expect(end()).toBe(0.25);
    clock.t += 1000;
    expect(end()).toBe(0.25);
    expect(h.snapshot().count).toBe(1);
    expect(h.snapshot().buckets[1].count).toBe(1);
  });

  it('keeps concurrent timers independent', () => {
    const clock = { t: 0 };
    const h = make([0.1, 1], () => clock.t);
    const a = h.startTimer();
    clock.t += 50;
    const b = h.startTimer();
    clock.t += 500;
    expect(b()).toBe(0.5);
    expect(a()).toBe(0.55);
    expect(h.snapshot().sum).toBeCloseTo(1.05, 10);
  });
});

describe('quantile', () => {
  it('interpolates inside the bucket where the rank falls', () => {
    const h = make([0.1, 0.5, 1]);
    for (let i = 0; i < 90; i++) h.observe(0.05);
    for (let i = 0; i < 10; i++) h.observe(0.8);
    expect(h.quantile(0.5)).toBeCloseTo(0.1 * (50 / 90), 10);
    expect(h.quantile(0.9)).toBeCloseTo(0.1, 10);
    expect(h.quantile(0.95)).toBeCloseTo(0.5 + 0.5 * (5 / 10), 10);
    expect(h.quantile(0.99)).toBeCloseTo(0.5 + 0.5 * (9 / 10), 10);
  });

  it('shows the tail that the average hides', () => {
    const h = make([0.1, 0.25, 0.5, 1, 2.5, 5]);
    for (let i = 0; i < 98; i++) h.observe(0.1);
    h.observe(4);
    h.observe(4);
    const mean = h.snapshot().sum / h.snapshot().count;
    expect(mean).toBeLessThan(0.2);
    expect(h.quantile(0.99)).toBeGreaterThan(2.5);
  });

  it('returns the highest finite bound for ranks in +Inf, and NaN when empty', () => {
    const h = make([0.1, 0.5]);
    expect(h.quantile(0.5)).toBeNaN();
    h.observe(0.05);
    h.observe(30);
    expect(h.quantile(1)).toBe(0.5);
    expect(h.quantile(0.5)).toBeCloseTo(0.1, 10);
  });

  it('uses 0 as the lower bound of the first bucket, and refuses q outside [0, 1]', () => {
    const h = make([2, 4]);
    for (let i = 0; i < 4; i++) h.observe(1);
    expect(h.quantile(0.25)).toBeCloseTo(0.5, 10);
    expect(h.quantile(0)).toBe(0);
    for (const bad of [-0.1, 1.01, NaN]) expect(() => h.quantile(bad)).toThrow(RangeError);
  });
});

describe('text', () => {
  it('renders buckets, sum and count', () => {
    const h = make([0.1, 0.5]);
    for (const v of [0.05, 0.05, 0.05, 0.2, 0.4, 6.5]) h.observe(v);
    expect(h.text('checkout_duration_seconds')).toBe(
      'checkout_duration_seconds_bucket{le="0.1"} 3\n' +
      'checkout_duration_seconds_bucket{le="0.5"} 5\n' +
      'checkout_duration_seconds_bucket{le="+Inf"} 6\n' +
      'checkout_duration_seconds_sum ' + String(0.05 + 0.05 + 0.05 + 0.2 + 0.4 + 6.5) + '\n' +
      'checkout_duration_seconds_count 6\n',
    );
  });
});
