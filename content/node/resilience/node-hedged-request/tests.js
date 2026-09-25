const flush = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r)); };

const fakeTimers = () => {
  let next = 0;
  const pending = new Map();
  return {
    setTimeout(fn, ms) { const id = ++next; pending.set(id, { fn, ms }); return id; },
    clearTimeout(id) { pending.delete(id); },
    fire() {
      const entries = [...pending];
      if (entries.length !== 1) throw new Error(`expected exactly one pending timer, found ${entries.length}`);
      const [id, t] = entries[0];
      pending.delete(id);
      t.fn();
    },
    pending,
  };
};

/** A fake backend: every call is recorded with its own resolve/reject and its signal. */
const backend = () => {
  const calls = [];
  const fn = (signal, attempt) => new Promise((resolve, reject) => {
    calls.push({ attempt, signal, resolve, reject });
  });
  return { fn, calls };
};

const outcome = (p) => p.then((v) => ({ ok: v }), (e) => ({ err: e }));

describe('hedge', () => {
  it('returns the first attempt when it is fast, and never hedges', async () => {
    const timers = fakeTimers();
    const { fn, calls } = backend();
    const p = solution.hedge(fn, { delayMs: 50, timers });
    expect(calls.map((c) => c.attempt)).toEqual([1]);
    expect([...timers.pending.values()].map((t) => t.ms)).toEqual([50]);
    calls[0].resolve('fast');
    expect(await p).toBe('fast');
    expect(timers.pending.size).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].signal.aborted).toBe(false);
  });

  it('starts a second attempt after delayMs and takes whichever wins, aborting the loser', async () => {
    const timers = fakeTimers();
    const { fn, calls } = backend();
    const p = solution.hedge(fn, { delayMs: 50, timers });
    timers.fire();
    expect(calls.map((c) => c.attempt)).toEqual([1, 2]);
    expect(calls[0].signal).not.toBe(calls[1].signal);
    calls[1].resolve('hedge won');
    expect(await p).toBe('hedge won');
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].signal.aborted).toBe(false);
    // The loser finishing later changes nothing and raises nothing.
    calls[0].reject(new Error('aborted'));
    await flush();
    expect(timers.pending.size).toBe(0);
  });

  it('lets the original win after the hedge has started', async () => {
    const timers = fakeTimers();
    const { fn, calls } = backend();
    const p = solution.hedge(fn, { delayMs: 50, timers });
    timers.fire();
    calls[0].resolve('original');
    expect(await p).toBe('original');
    expect(calls[1].signal.aborted).toBe(true);
  });

  it('never starts more than maxAttempts, and sets no timer after the last', async () => {
    const timers = fakeTimers();
    const { fn, calls } = backend();
    const p = solution.hedge(fn, { delayMs: 10, maxAttempts: 3, timers });
    timers.fire();
    timers.fire();
    expect(calls.map((c) => c.attempt)).toEqual([1, 2, 3]);
    expect(timers.pending.size).toBe(0);
    calls[2].resolve(3);
    expect(await p).toBe(3);
    expect(calls[0].signal.aborted && calls[1].signal.aborted).toBe(true);
  });

  it('ignores a failure while another attempt is still in flight', async () => {
    const timers = fakeTimers();
    const { fn, calls } = backend();
    const p = solution.hedge(fn, { delayMs: 50, timers });
    timers.fire();
    calls[0].reject(new Error('replica down'));
    await flush();
    expect(calls).toHaveLength(2);
    calls[1].resolve('saved');
    expect(await p).toBe('saved');
  });

  it('starts the next attempt at once when the only one in flight fails', async () => {
    const timers = fakeTimers();
    const { fn, calls } = backend();
    const p = solution.hedge(fn, { delayMs: 50, maxAttempts: 3, timers });
    calls[0].reject(new Error('fast failure'));
    await flush();
    expect(calls.map((c) => c.attempt)).toEqual([1, 2]);
    // The timer was reset for attempt 2: still exactly one pending.
    expect(timers.pending.size).toBe(1);
    timers.fire();
    expect(calls.map((c) => c.attempt)).toEqual([1, 2, 3]);
    calls[2].resolve('third');
    expect(await p).toBe('third');
  });

  it('rejects with an AggregateError in attempt order when everything fails', async () => {
    const timers = fakeTimers();
    const { fn, calls } = backend();
    const p = outcome(solution.hedge(fn, { delayMs: 50, timers }));
    timers.fire();
    const e1 = new Error('one');
    const e2 = new Error('two');
    calls[1].reject(e2);
    await flush();
    calls[0].reject(e1);
    const r = await p;
    expect(r.err).toBeInstanceOf(AggregateError);
    expect(r.err.errors).toHaveLength(2);
    expect(r.err.errors[0]).toBe(e1);
    expect(r.err.errors[1]).toBe(e2);
    expect(timers.pending.size).toBe(0);
  });

  it('turns a synchronous throw from fn into a failed attempt', async () => {
    const timers = fakeTimers();
    let n = 0;
    const p = solution.hedge((signal, attempt) => {
      n++;
      if (attempt === 1) throw new Error('sync');
      return Promise.resolve('second');
    }, { delayMs: 50, timers });
    expect(await p).toBe('second');
    expect(n).toBe(2);
  });

  it('honours an already-aborted signal without calling fn', async () => {
    const timers = fakeTimers();
    const { fn, calls } = backend();
    const controller = new AbortController();
    const reason = new Error('client went away');
    controller.abort(reason);
    const r = await outcome(solution.hedge(fn, { delayMs: 50, timers, signal: controller.signal }));
    expect(r.err).toBe(reason);
    expect(calls).toHaveLength(0);
    expect(timers.pending.size).toBe(0);
  });

  it('aborts every attempt when the caller aborts', async () => {
    const timers = fakeTimers();
    const { fn, calls } = backend();
    const controller = new AbortController();
    const p = outcome(solution.hedge(fn, { delayMs: 50, timers, signal: controller.signal }));
    timers.fire();
    const reason = new Error('deadline');
    controller.abort(reason);
    const r = await p;
    expect(r.err).toBe(reason);
    expect(calls.every((c) => c.signal.aborted)).toBe(true);
    expect(timers.pending.size).toBe(0);
    calls[0].resolve('too late');
    await flush();
  });

  it('removes its listener from the caller\'s signal when it finishes', async () => {
    const timers = fakeTimers();
    const controller = new AbortController();
    const signal = controller.signal;
    let added = 0;
    let removed = 0;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = (...args) => { if (args[0] === 'abort') added++; return add(...args); };
    signal.removeEventListener = (...args) => { if (args[0] === 'abort') removed++; return remove(...args); };
    for (let i = 0; i < 3; i++) {
      expect(await solution.hedge(async () => i, { delayMs: 50, timers, signal })).toBe(i);
    }
    // Whatever was added to the long-lived signal must have been removed again.
    expect(removed).toBe(added);
  });
});
