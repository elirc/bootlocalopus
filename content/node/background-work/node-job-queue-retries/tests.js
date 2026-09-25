const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

/** Timers the test fires by hand. */
const fakeTimers = () => {
  const pending = new Map();
  let n = 0;
  return {
    pending,
    delays: () => [...pending.keys()].map((h) => h.ms),
    setTimeout(fn, ms) { const handle = { n: ++n, ms }; pending.set(handle, fn); return handle; },
    clearTimeout(handle) { pending.delete(handle); },
    fireAll() { for (const [handle, fn] of [...pending]) { pending.delete(handle); fn(); } },
  };
};

/** A handler whose every call waits for the test to settle it. */
const manual = () => {
  const calls = [];
  const fn = (payload, meta) => new Promise((resolve, reject) => { calls.push({ payload, meta, resolve, reject }); });
  return { fn, calls };
};

const setup = (options = {}) => {
  const timers = fakeTimers();
  const email = manual();
  const q = solution.createQueue({ handlers: { email: email.fn }, timers, ...options });
  return { q, timers, email };
};

describe('running jobs', () => {
  it('returns sequential ids and runs the handler with payload, id and attempt', async () => {
    const { q, email } = setup();
    const a = q.enqueue('email', { to: 'a@x.io' });
    const b = q.enqueue('email', { to: 'b@x.io' });
    expect([a, b]).toEqual(['job_1', 'job_2']);
    await flush();
    expect(email.calls).toHaveLength(1);
    expect(email.calls[0].payload).toEqual({ to: 'a@x.io' });
    expect(email.calls[0].meta).toEqual({ id: 'job_1', attempt: 1 });
    expect(q.get(a).state).toBe('running');
    expect(q.get(b).state).toBe('queued');
    email.calls[0].resolve();
    await flush();
    expect(q.get(a)).toStrictEqual({ id: 'job_1', type: 'email', payload: { to: 'a@x.io' }, state: 'succeeded', attempts: 1, lastError: null });
    expect(email.calls).toHaveLength(2);
    expect(email.calls[1].meta).toEqual({ id: 'job_2', attempt: 1 });
  });

  it('runs at most `concurrency` jobs at once, FIFO', async () => {
    const { q, email } = setup({ concurrency: 2 });
    for (let i = 0; i < 5; i++) q.enqueue('email', i);
    await flush();
    expect(email.calls.map((c) => c.payload)).toEqual([0, 1]);
    email.calls[1].resolve();
    await flush();
    expect(email.calls.map((c) => c.payload)).toEqual([0, 1, 2]);
    email.calls[0].resolve();
    email.calls[2].resolve();
    await flush();
    expect(email.calls.map((c) => c.payload)).toEqual([0, 1, 2, 3, 4]);
  });

  it('throws a TypeError at enqueue for an unknown type', () => {
    const { q } = setup();
    expect(() => q.enqueue('emial', {})).toThrow(TypeError);
    expect(() => q.enqueue('toString', {})).toThrow(TypeError);
    expect(q.get('job_1')).toBeUndefined();
  });

  it('returns snapshots that cannot change the queue', async () => {
    const { q } = setup();
    const id = q.enqueue('email', { to: 'x' });
    const snap = q.get(id);
    snap.state = 'failed';
    snap.attempts = 99;
    expect(q.get(id).state).not.toBe('failed');
    expect(q.get(id).attempts).not.toBe(99);
    expect(q.get('job_404')).toBeUndefined();
  });
});

describe('retries', () => {
  it('waits backoff(attempts) via timers, then retries with the next attempt number', async () => {
    const { q, timers, email } = setup();
    const id = q.enqueue('email', 'p');
    await flush();
    email.calls[0].reject(new Error('smtp 421'));
    await flush();
    expect(q.get(id)).toMatchObject({ state: 'waiting', attempts: 1, lastError: 'smtp 421' });
    expect(timers.delays()).toEqual([1000]);
    expect(email.calls).toHaveLength(1);

    timers.fireAll();
    await flush();
    expect(email.calls).toHaveLength(2);
    expect(email.calls[1].meta).toEqual({ id, attempt: 2 });
    email.calls[1].reject(new Error('smtp 451'));
    await flush();
    expect(timers.delays()).toEqual([2000]);
    timers.fireAll();
    await flush();
    email.calls[2].resolve();
    await flush();
    expect(q.get(id)).toMatchObject({ state: 'succeeded', attempts: 3, lastError: 'smtp 451' });
  });

  it('fails the job after maxAttempts without scheduling another retry', async () => {
    const { q, timers, email } = setup({ maxAttempts: 2, backoff: (n) => n * 10 });
    const id = q.enqueue('email', 'p');
    await flush();
    email.calls[0].reject(new Error('one'));
    await flush();
    expect(timers.delays()).toEqual([10]);
    timers.fireAll();
    await flush();
    email.calls[1].reject(new Error('two'));
    await flush();
    expect(q.get(id)).toMatchObject({ state: 'failed', attempts: 2, lastError: 'two' });
    expect(timers.pending.size).toBe(0);
  });

  it('treats a synchronous throw as a failed attempt', async () => {
    const timers = fakeTimers();
    let calls = 0;
    const q = solution.createQueue({
      handlers: { boom: () => { calls++; throw new Error('sync'); } },
      timers, maxAttempts: 2,
    });
    let id;
    expect(() => { id = q.enqueue('boom', null); }).not.toThrow();
    await flush();
    expect(q.get(id)).toMatchObject({ state: 'waiting', lastError: 'sync' });
    timers.fireAll();
    await flush();
    expect(q.get(id)).toMatchObject({ state: 'failed', attempts: 2 });
    expect(calls).toBe(2);
  });

  it('gives the slot back while a job backs off', async () => {
    const { q, timers, email } = setup({ concurrency: 1 });
    const a = q.enqueue('email', 'a');
    const b = q.enqueue('email', 'b');
    const c = q.enqueue('email', 'c');
    await flush();
    email.calls[0].reject(new Error('down'));
    await flush();
    expect(q.get(a).state).toBe('waiting');
    expect(q.get(b).state).toBe('running');
    expect(email.calls.map((x) => x.payload)).toEqual(['a', 'b']);
    email.calls[1].resolve();
    await flush();
    expect(q.get(c).state).toBe('running');
  });

  it('puts a retried job at the back of the queue', async () => {
    const { q, timers, email } = setup({ concurrency: 1 });
    q.enqueue('email', 'a');
    await flush();
    email.calls[0].reject(new Error('down'));
    await flush();
    q.enqueue('email', 'b');
    q.enqueue('email', 'c');
    await flush();
    timers.fireAll();                 // a is queued again, behind c
    q.enqueue('email', 'd');
    await flush();
    for (let i = 1; i < 5; i++) { email.calls[i].resolve(); await flush(); }
    expect(email.calls.map((x) => x.payload)).toEqual(['a', 'b', 'c', 'a', 'd']);
  });

  it('keeps one job\'s failures away from the others', async () => {
    const timers = fakeTimers();
    const seen = [];
    const q = solution.createQueue({
      handlers: { work: async (p) => { seen.push(p); if (p === 'bad') throw new Error('bad'); } },
      concurrency: 3, timers, maxAttempts: 1,
    });
    const ids = ['ok1', 'bad', 'ok2'].map((p) => q.enqueue('work', p));
    await q.onIdle();
    expect(ids.map((id) => q.get(id).state)).toEqual(['succeeded', 'failed', 'succeeded']);
  });
});

describe('onIdle', () => {
  it('resolves at once when idle, and waits for running and backing-off jobs', async () => {
    const { q, timers, email } = setup();
    let idle = false;
    await q.onIdle();
    q.enqueue('email', 'x');
    q.onIdle().then(() => { idle = true; });
    await flush();
    email.calls[0].reject(new Error('down'));
    await flush();
    expect(idle).toBe(false);            // waiting for a retry is not idle
    timers.fireAll();
    await flush();
    expect(idle).toBe(false);
    email.calls[1].resolve();
    await flush();
    expect(idle).toBe(true);
  });

  it('resolves every waiter', async () => {
    const { q, email } = setup();
    q.enqueue('email', 'x');
    const results = [];
    const all = Promise.all([q.onIdle().then(() => results.push(1)), q.onIdle().then(() => results.push(2))]);
    await flush();
    email.calls[0].resolve();
    await all;
    expect(results.sort()).toEqual([1, 2]);
  });
});
