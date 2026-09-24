const flush = () => new Promise((r) => setImmediate(r));

/** Timeouts the test fires by hand. */
const fakeTimers = () => {
  const pending = new Map();
  let n = 0;
  return {
    pending,
    setTimeout(fn, ms) { const handle = { n: ++n, ms }; pending.set(handle, fn); return handle; },
    clearTimeout(handle) { pending.delete(handle); },
    fireAll() { for (const [handle, fn] of [...pending]) { pending.delete(handle); fn(); } },
  };
};

/** A dependency whose every call waits for the test to settle it. */
const dependency = () => {
  const calls = [];
  const fn = (...args) => new Promise((resolve, reject) => { calls.push({ args, resolve, reject }); });
  return { fn, calls };
};

const outcome = (p) => p.then((value) => ({ value }), (error) => ({ error }));
const boom = (msg = 'boom') => new Error(msg);

/** A breaker over a manual dependency, a manual clock and manual timers. */
const setup = (options = {}) => {
  const dep = dependency();
  const timers = fakeTimers();
  const clock = { t: 1_000_000 };
  const transitions = [];
  const breaker = solution.createBreaker(dep.fn, {
    failureThreshold: 3, resetTimeoutMs: 10_000, callTimeoutMs: 500,
    now: () => clock.t, timers,
    onStateChange: (from, to) => transitions.push(from + '>' + to),
    ...options,
  });
  /** Make one call and settle it with a rejection. */
  const failOnce = async () => {
    const before = dep.calls.length;
    const p = outcome(breaker.call());
    await flush();
    if (dep.calls.length === before) return p; // not admitted (open)
    dep.calls[dep.calls.length - 1].reject(boom());
    return p;
  };
  return { breaker, dep, timers, clock, transitions, failOnce };
};

const tripOpen = async (s) => {
  for (let i = 0; i < 3; i++) await s.failOnce();
  expect(s.breaker.state).toBe('open');
};

describe('closed', () => {
  it('passes arguments and results straight through', async () => {
    const s = setup();
    expect(s.breaker.state).toBe('closed');
    const p = s.breaker.call('a', 2);
    await flush();
    expect(s.dep.calls).toHaveLength(1);
    expect(s.dep.calls[0].args).toEqual(['a', 2]);
    s.dep.calls[0].resolve({ ok: true });
    expect(await p).toEqual({ ok: true });
    expect(s.breaker.state).toBe('closed');
  });

  it('rejects with the original error while under the threshold', async () => {
    const s = setup();
    const p = outcome(s.breaker.call());
    await flush();
    const err = boom('upstream 503');
    s.dep.calls[0].reject(err);
    expect((await p).error).toBe(err);
    expect(s.breaker.failures).toBe(1);
    expect(s.breaker.state).toBe('closed');
  });

  it('opens after failureThreshold consecutive failures', async () => {
    const s = setup();
    await s.failOnce();
    await s.failOnce();
    expect(s.breaker.state).toBe('closed');
    expect(s.breaker.failures).toBe(2);
    await s.failOnce();
    expect(s.breaker.state).toBe('open');
    expect(s.transitions).toEqual(['closed>open']);
  });

  it('counts consecutive failures: a success resets the count', async () => {
    const s = setup();
    await s.failOnce();
    await s.failOnce();
    const ok = s.breaker.call();
    await flush();
    s.dep.calls[2].resolve('fine');
    await ok;
    expect(s.breaker.failures).toBe(0);
    await s.failOnce();
    await s.failOnce();
    expect(s.breaker.state).toBe('closed');
  });

  it('defaults to a threshold of 5', async () => {
    let calls = 0;
    const breaker = solution.createBreaker(async () => { calls++; throw boom(); }, { timers: fakeTimers() });
    for (let i = 0; i < 4; i++) await outcome(breaker.call());
    expect(breaker.state).toBe('closed');
    await outcome(breaker.call());
    expect(breaker.state).toBe('open');
    await outcome(breaker.call());
    expect(calls).toBe(5);
  });

  it('treats a synchronous throw as a failed call, never a synchronous throw', async () => {
    const timers = fakeTimers();
    const err = boom('sync');
    const breaker = solution.createBreaker(() => { throw err; }, { failureThreshold: 1, timers });
    let p;
    expect(() => { p = breaker.call(); }).not.toThrow();
    expect((await outcome(p)).error).toBe(err);
    expect(breaker.state).toBe('open');
    expect(timers.pending.size).toBe(0);
  });
});

describe('open', () => {
  it('fails fast with CircuitOpenError and does not call the dependency', async () => {
    const s = setup();
    await tripOpen(s);
    const before = s.dep.calls.length;
    const r = await outcome(s.breaker.call());
    await flush();
    expect(r.error).toBeInstanceOf(solution.CircuitOpenError);
    expect(r.error).toBeInstanceOf(Error);
    expect(r.error.name).toBe('CircuitOpenError');
    expect(s.dep.calls.length).toBe(before);
  });

  it('stays open until resetTimeoutMs has passed', async () => {
    const s = setup();
    await tripOpen(s);
    const before = s.dep.calls.length;
    s.clock.t += 9_999;
    expect((await outcome(s.breaker.call())).error).toBeInstanceOf(solution.CircuitOpenError);
    await flush();
    expect(s.dep.calls.length).toBe(before);
    expect(s.breaker.state).toBe('open');
  });
});

describe('half-open', () => {
  it('lets exactly one probe through after the cooldown', async () => {
    const s = setup();
    await tripOpen(s);
    const before = s.dep.calls.length;
    s.clock.t += 10_000;
    const probe = s.breaker.call('probe');
    await flush();
    expect(s.breaker.state).toBe('half-open');
    expect(s.dep.calls.length).toBe(before + 1);

    const others = [outcome(s.breaker.call('x')), outcome(s.breaker.call('y'))];
    await flush();
    for (const r of await Promise.all(others)) expect(r.error).toBeInstanceOf(solution.CircuitOpenError);
    expect(s.dep.calls.length).toBe(before + 1);

    s.dep.calls[before].resolve('recovered');
    expect(await probe).toBe('recovered');
  });

  it('closes when the probe succeeds', async () => {
    const s = setup();
    await tripOpen(s);
    s.clock.t += 10_000;
    const probe = s.breaker.call();
    await flush();
    s.dep.calls[s.dep.calls.length - 1].resolve('ok');
    await probe;
    expect(s.breaker.state).toBe('closed');
    expect(s.breaker.failures).toBe(0);
    expect(s.transitions).toEqual(['closed>open', 'open>half-open', 'half-open>closed']);

    // Fully closed again: calls flow, and it takes a full threshold to reopen.
    const next = s.breaker.call();
    await flush();
    s.dep.calls[s.dep.calls.length - 1].resolve('next');
    expect(await next).toBe('next');
    await s.failOnce();
    await s.failOnce();
    expect(s.breaker.state).toBe('closed');
  });

  it('reopens when the probe fails, with a fresh cooldown', async () => {
    const s = setup();
    await tripOpen(s);
    s.clock.t += 10_000;
    await s.failOnce();
    expect(s.breaker.state).toBe('open');
    expect(s.transitions).toEqual(['closed>open', 'open>half-open', 'half-open>open']);

    const before = s.dep.calls.length;
    s.clock.t += 9_999;          // measured from the failed probe, not the first opening
    expect((await outcome(s.breaker.call())).error).toBeInstanceOf(solution.CircuitOpenError);
    await flush();
    expect(s.dep.calls.length).toBe(before);
    s.clock.t += 1;
    const probe = s.breaker.call();
    await flush();
    expect(s.dep.calls.length).toBe(before + 1);
    s.dep.calls[before].resolve('ok');
    await probe;
    expect(s.breaker.state).toBe('closed');
  });
});

describe('timeouts', () => {
  it('fails a hung call with TimeoutError when its timer fires', async () => {
    const s = setup();
    const p = outcome(s.breaker.call());
    await flush();
    expect(s.timers.pending.size).toBe(1);
    expect([...s.timers.pending.keys()][0].ms).toBe(500);
    s.timers.fireAll();
    const r = await p;
    expect(r.error).toBeInstanceOf(solution.TimeoutError);
    expect(r.error.name).toBe('TimeoutError');
    expect(s.breaker.failures).toBe(1);
  });

  it('clears the timer when the call settles first', async () => {
    const s = setup();
    const ok = s.breaker.call();
    const bad = outcome(s.breaker.call());
    await flush();
    expect(s.timers.pending.size).toBe(2);
    s.dep.calls[0].resolve(1);
    s.dep.calls[1].reject(boom());
    await ok;
    await bad;
    expect(s.timers.pending.size).toBe(0);
  });

  it('ignores a result that arrives after the timeout', async () => {
    const s = setup({ failureThreshold: 5 });
    const first = outcome(s.breaker.call());
    await flush();
    s.timers.fireAll();
    expect((await first).error).toBeInstanceOf(solution.TimeoutError);
    s.dep.calls[0].resolve('late');         // a late success cannot reset the count
    await flush();
    expect(s.breaker.failures).toBe(1);

    const second = outcome(s.breaker.call());
    await flush();
    s.timers.fireAll();
    expect((await second).error).toBeInstanceOf(solution.TimeoutError);
    s.dep.calls[1].reject(boom('late'));    // must not count twice, nor go unhandled
    await flush();
    expect(s.breaker.failures).toBe(2);
  });

  it('counts timeouts toward opening, even when isFailure says otherwise', async () => {
    const s = setup({ isFailure: () => false });
    for (let i = 0; i < 3; i++) {
      const p = outcome(s.breaker.call());
      await flush();
      s.timers.fireAll();
      await p;
    }
    expect(s.breaker.state).toBe('open');
  });

  it('reopens when the half-open probe times out', async () => {
    const s = setup();
    await tripOpen(s);
    s.clock.t += 10_000;
    const probe = outcome(s.breaker.call());
    await flush();
    s.timers.fireAll();
    expect((await probe).error).toBeInstanceOf(solution.TimeoutError);
    expect(s.breaker.state).toBe('open');
  });
});

describe('stale results', () => {
  it('does not let a late success close a circuit that opened meanwhile', async () => {
    const s = setup({ failureThreshold: 1 });
    const slow = s.breaker.call();
    const fast = outcome(s.breaker.call());
    await flush();
    s.dep.calls[1].reject(boom());       // opens the circuit
    await fast;
    expect(s.breaker.state).toBe('open');
    const failuresWhenOpened = s.breaker.failures;
    s.dep.calls[0].resolve('late');      // admitted while closed, settles while open
    expect(await slow).toBe('late');     // the caller still gets its answer
    expect(s.breaker.state).toBe('open');
    expect(s.breaker.failures).toBe(failuresWhenOpened);
    expect(s.transitions).toEqual(['closed>open']);
  });

  it('does not let a late failure extend the cooldown', async () => {
    const s = setup({ failureThreshold: 1 });
    const slow = outcome(s.breaker.call());
    const fast = outcome(s.breaker.call());
    await flush();
    s.dep.calls[1].reject(boom());       // opens at t0
    await fast;
    s.clock.t += 6_000;
    s.dep.calls[0].reject(boom('late'));
    await slow;
    s.clock.t += 4_000;                  // 10 s after the real opening
    const probe = s.breaker.call();
    await flush();
    expect(s.dep.calls).toHaveLength(3);
    expect(s.breaker.state).toBe('half-open');
    s.dep.calls[2].resolve('ok');
    await probe;
  });
});

describe('fallback', () => {
  it('answers failures, timeouts and open circuits with fallback(error, ...args)', async () => {
    const seen = [];
    const s = setup({
      failureThreshold: 2,
      fallback: (error, ...args) => { seen.push([error.name, ...args]); return 'cached:' + args[0]; },
    });
    const failed = s.breaker.call('a');
    await flush();
    s.dep.calls[0].reject(boom());
    expect(await failed).toBe('cached:a');

    const timedOut = s.breaker.call('b');
    await flush();
    s.timers.fireAll();
    expect(await timedOut).toBe('cached:b');
    expect(s.breaker.state).toBe('open');

    expect(await s.breaker.call('c')).toBe('cached:c');
    expect(seen).toEqual([['Error', 'a'], ['TimeoutError', 'b'], ['CircuitOpenError', 'c']]);
  });

  it('awaits an async fallback, and rejects if the fallback fails', async () => {
    const s = setup({ fallback: async (error) => { if (error.message === 'fatal') throw boom('fallback broke'); return 'degraded'; } });
    const a = s.breaker.call();
    await flush();
    s.dep.calls[0].reject(boom());
    expect(await a).toBe('degraded');
    const b = outcome(s.breaker.call());
    await flush();
    s.dep.calls[1].reject(boom('fatal'));
    expect((await b).error.message).toBe('fallback broke');
  });

  it('does not use the fallback for a successful call', async () => {
    let used = 0;
    const s = setup({ fallback: () => { used++; return 'x'; } });
    const p = s.breaker.call();
    await flush();
    s.dep.calls[0].resolve('real');
    expect(await p).toBe('real');
    expect(used).toBe(0);
  });
});

describe('isFailure', () => {
  class NotFound extends Error {}
  const options = { isFailure: (e) => !(e instanceof NotFound), fallback: () => 'fallback' };

  it('passes errors that do not count straight to the caller, without the fallback', async () => {
    const s = setup(options);
    const p = outcome(s.breaker.call());
    await flush();
    const err = new NotFound('no such user');
    s.dep.calls[0].reject(err);
    expect((await p).error).toBe(err);
  });

  it('never trips on them, and treats them as the dependency answering', async () => {
    const s = setup(options);
    await s.failOnce();
    await s.failOnce();
    for (let i = 0; i < 5; i++) {
      const p = outcome(s.breaker.call());
      await flush();
      s.dep.calls[s.dep.calls.length - 1].reject(new NotFound());
      await p;
    }
    expect(s.breaker.state).toBe('closed');
    expect(s.breaker.failures).toBe(0);
  });

  it('closes a half-open circuit when the probe gets one', async () => {
    const s = setup({ isFailure: options.isFailure });
    await tripOpen(s);
    s.clock.t += 10_000;
    const probe = outcome(s.breaker.call());
    await flush();
    s.dep.calls[s.dep.calls.length - 1].reject(new NotFound());
    expect((await probe).error).toBeInstanceOf(NotFound);
    expect(s.breaker.state).toBe('closed');
  });
});
