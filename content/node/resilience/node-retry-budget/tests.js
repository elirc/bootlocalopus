const setup = (opts = {}) => {
  const clock = { t: 1_000_000 };
  const budget = solution.createRetryBudget({ now: () => clock.t, ...opts });
  return { budget, clock };
};

const retriesGranted = (budget, n) => {
  let granted = 0;
  for (let i = 0; i < n; i++) if (budget.tryRetry()) granted++;
  return granted;
};

describe('createRetryBudget', () => {
  it('allows minRetries even with no traffic', () => {
    const { budget } = setup({ minRetries: 3 });
    expect(retriesGranted(budget, 10)).toBe(3);
    expect(budget.stats()).toEqual({ requests: 0, retries: 3 });
  });

  it('allows ratio × requests once that exceeds the floor', () => {
    const { budget } = setup({ ratio: 0.1, minRetries: 2 });
    for (let i = 0; i < 100; i++) budget.recordRequest();
    expect(retriesGranted(budget, 50)).toBe(10);
    expect(budget.stats()).toEqual({ requests: 100, retries: 10 });
  });

  it('floors the ratio', () => {
    const { budget } = setup({ ratio: 0.1, minRetries: 0 });
    for (let i = 0; i < 29; i++) budget.recordRequest();
    expect(retriesGranted(budget, 10)).toBe(2);
  });

  it('refusing a retry records nothing', () => {
    const { budget } = setup({ minRetries: 1 });
    budget.tryRetry();
    for (let i = 0; i < 5; i++) expect(budget.tryRetry()).toBe(false);
    expect(budget.stats().retries).toBe(1);
  });

  it('forgets events exactly windowMs later', () => {
    const { budget, clock } = setup({ ratio: 0.5, minRetries: 0, windowMs: 1000 });
    for (let i = 0; i < 4; i++) budget.recordRequest();
    expect(retriesGranted(budget, 5)).toBe(2);
    clock.t += 500;
    for (let i = 0; i < 4; i++) budget.recordRequest(); // 8 requests in the window → 4 retries allowed
    expect(retriesGranted(budget, 5)).toBe(2);
    clock.t += 499; // first batch is 999 ms old: still in
    expect(budget.stats()).toEqual({ requests: 8, retries: 4 });
    clock.t += 1; // first batch is exactly 1000 ms old: gone
    expect(budget.stats()).toEqual({ requests: 4, retries: 2 });
    expect(budget.tryRetry()).toBe(false); // 2 of floor(0.5 × 4) = 2 used
    clock.t += 500;
    expect(budget.stats()).toEqual({ requests: 0, retries: 0 });
  });

  it('counts only the window after a long run', () => {
    const { budget, clock } = setup({ windowMs: 100 });
    for (let i = 0; i < 10_000; i++) {
      budget.recordRequest();
      budget.tryRetry();
      clock.t += 1;
    }
    expect(budget.stats().requests).toBe(99); // recorded at t-1 … t-99; the one at t-100 has expired
    expect(budget.stats().retries).toBeLessThanOrEqual(100);
  });
});

describe('callWithBudget', () => {
  const noSleep = { sleep: async () => {} };

  it('returns the first success and passes the attempt number', async () => {
    const { budget } = setup();
    const seen = [];
    const out = await solution.callWithBudget(async (attempt) => {
      seen.push(attempt);
      if (attempt < 3) throw new Error('flaky');
      return 'ok';
    }, { budget, ...noSleep });
    expect(out).toBe('ok');
    expect(seen).toEqual([1, 2, 3]);
    expect(budget.stats()).toEqual({ requests: 1, retries: 2 });
  });

  it('rethrows the last error unchanged after maxAttempts, without spending budget on the final one', async () => {
    const { budget } = setup();
    let n = 0;
    const errors = [];
    const p = solution.callWithBudget(async () => {
      const e = new Error('fail ' + ++n);
      errors.push(e);
      throw e;
    }, { budget, maxAttempts: 2, ...noSleep });
    let caught;
    try { await p; } catch (e) { caught = e; }
    expect(caught).toBe(errors[1]);
    expect(n).toBe(2);
    expect(budget.stats()).toEqual({ requests: 1, retries: 1 });
  });

  it('does not retry, or spend budget, when shouldRetry says no', async () => {
    const { budget } = setup();
    let n = 0;
    const err = Object.assign(new Error('bad request'), { status: 400 });
    let caught;
    try {
      await solution.callWithBudget(async () => { n++; throw err; }, { budget, shouldRetry: (e) => e.status !== 400, ...noSleep });
    } catch (e) { caught = e; }
    expect(caught).toBe(err);
    expect(n).toBe(1);
    expect(budget.stats()).toEqual({ requests: 1, retries: 0 });
  });

  it('stops retrying when the budget is spent: an outage costs +10%, not +200%', async () => {
    const { budget } = setup({ ratio: 0.1, minRetries: 5 });
    let calls = 0;
    for (let i = 0; i < 100; i++) {
      await solution.callWithBudget(async () => { calls++; throw new Error('down'); }, { budget, maxAttempts: 3, ...noSleep }).catch(() => {});
    }
    // 100 originals + at most 10 retries (5 early on from the floor, the rest from the ratio).
    expect(calls).toBeLessThanOrEqual(110);
    expect(calls).toBeGreaterThanOrEqual(105);
    expect(budget.stats().retries).toBe(calls - 100);
  });

  it('sleeps delayMs(attempt) before each retry', async () => {
    const { budget } = setup();
    const slept = [];
    let n = 0;
    await solution.callWithBudget(async () => { if (++n < 3) throw new Error('x'); return n; }, {
      budget, delayMs: (attempt) => attempt * 100, sleep: async (ms) => { slept.push(ms); },
    });
    expect(slept).toEqual([100, 200]);
  });

  it('does not sleep when it is not going to retry', async () => {
    const { budget } = setup({ minRetries: 0, ratio: 0 });
    const slept = [];
    await solution.callWithBudget(async () => { throw new Error('x'); }, { budget, sleep: async (ms) => { slept.push(ms); } }).catch(() => {});
    expect(slept).toEqual([]);
  });
});
