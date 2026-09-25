const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

/** Timers the test fires by hand, selected by their delay. */
function fakeTimers() {
  const pending = new Map();
  let n = 0;
  return {
    pending,
    count: (ms) => [...pending.keys()].filter((h) => h.ms === ms).length,
    setTimeout(fn, ms) { const h = { n: ++n, ms }; pending.set(h, fn); return h; },
    clearTimeout(h) { pending.delete(h); },
    async fire(ms) {
      const due = [...pending.keys()].filter((h) => h.ms === ms);
      for (const h of due) { const fn = pending.get(h); pending.delete(h); fn(); }
      await flush();
      return due.length;
    },
  };
}

/** A store backed by an array of jobs; every call is logged. */
function fakeStore({ failHeartbeat = () => false, failComplete = false, failClaim = false } = {}) {
  const available = [];
  const log = [];
  let manualClaim = null;
  const store = {
    claim(workerId) {
      log.push(['claim', workerId]);
      if (manualClaim) return new Promise((resolve) => { manualClaim.resolve = resolve; });
      if (failClaim) return Promise.reject(new Error('store down'));
      return Promise.resolve(available.shift() ?? null);
    },
    async heartbeat(id, token) {
      log.push(['heartbeat', id, token]);
      if (failHeartbeat(id)) throw new Error('lease lost');
    },
    async complete(id, token) {
      log.push(['complete', id, token]);
      if (failComplete) throw new Error('store down');
    },
    async release(id, token, opts) { log.push(['release', id, token, opts]); },
    async bury(id, token, info) { log.push(['bury', id, token, info]); },
  };
  let seq = 0;
  const add = (type, payload, attempt = 1) => {
    const id = 'j' + ++seq;
    available.push({ id, type, payload, token: 't-' + id, attempt });
    return id;
  };
  const holdNextClaim = () => { manualClaim = {}; return manualClaim; };
  const of = (kind) => log.filter((e) => e[0] === kind);
  return { store, add, log, of, holdNextClaim };
}

/** Handlers whose calls wait for the test. */
function manualHandlers() {
  const calls = new Map();
  const make = () => (payload, ctx) => new Promise((resolve, reject) => { calls.set(ctx.id, { payload, ctx, resolve, reject }); });
  return { handlers: { email: make(), report: make() }, calls };
}

const setup = (options = {}, storeOptions) => {
  const s = fakeStore(storeOptions);
  const timers = fakeTimers();
  const h = manualHandlers();
  const worker = solution.createWorker({ store: s.store, handlers: h.handlers, workerId: 'w-1', timers, ...options });
  return { s, timers, h, worker };
};

describe('claiming', () => {
  it('claims up to concurrency jobs and passes payload, id, attempt and a signal', async () => {
    const { s, h, worker } = setup();
    s.add('email', { to: 'a' });
    s.add('email', { to: 'b' }, 3);
    s.add('email', { to: 'c' });
    worker.start();
    await flush();
    expect(s.of('claim')).toEqual([['claim', 'w-1'], ['claim', 'w-1']]);
    expect(worker.active).toBe(2);
    expect(h.calls.get('j1').payload).toEqual({ to: 'a' });
    expect(h.calls.get('j2').ctx.attempt).toBe(3);
    expect(h.calls.get('j2').ctx.id).toBe('j2');
    expect(h.calls.get('j1').ctx.signal).toBeInstanceOf(AbortSignal);
    expect(h.calls.get('j1').ctx.signal.aborted).toBe(false);
  });

  it('polls on a single timer while there is nothing to do', async () => {
    const { s, timers, worker } = setup();
    worker.start();
    await flush();
    expect(s.of('claim')).toHaveLength(1);
    expect(timers.count(1000)).toBe(1);
    await timers.fire(1000);
    expect(s.of('claim')).toHaveLength(2);
    expect(timers.count(1000)).toBe(1);
    s.add('email', {});
    await timers.fire(1000);
    expect(worker.active).toBe(1);
  });

  it('claims again immediately when a slot frees, without waiting for the poll timer', async () => {
    const { s, h, timers, worker } = setup({ concurrency: 1 });
    s.add('email', 1);
    s.add('email', 2);
    worker.start();
    await flush();
    expect(s.of('claim')).toHaveLength(1);
    h.calls.get('j1').resolve();
    await flush();
    expect(s.of('claim')).toHaveLength(2);
    expect(h.calls.has('j2')).toBe(true);
    expect(timers.count(1000)).toBe(0);
  });

  it('never has two claims in flight', async () => {
    const { s, worker } = setup({ concurrency: 3 });
    const held = s.holdNextClaim();
    worker.start();
    worker.start();
    await flush();
    expect(s.of('claim')).toHaveLength(1);
    held.resolve(null);
    await flush();
  });

  it('treats a failing claim like an empty queue', async () => {
    const { s, timers, worker } = setup({}, { failClaim: true });
    worker.start();
    await flush();
    expect(timers.count(1000)).toBe(1);
    expect(worker.active).toBe(0);
  });
});

describe('outcomes', () => {
  it('completes on success', async () => {
    const { s, h, worker } = setup();
    s.add('email', {});
    worker.start();
    await flush();
    h.calls.get('j1').resolve();
    await flush();
    expect(s.of('complete')).toEqual([['complete', 'j1', 't-j1']]);
    expect(worker.active).toBe(0);
  });

  it('releases a failure with backoff(attempt)', async () => {
    const { s, h, worker } = setup({ backoff: (a) => a * 100 });
    s.add('email', {}, 2);
    worker.start();
    await flush();
    h.calls.get('j1').reject(new Error('smtp down'));
    await flush();
    expect(s.of('release')).toEqual([['release', 'j1', 't-j1', { delayMs: 200 }]]);
    expect(s.of('complete')).toEqual([]);
  });

  it('buries after maxAttempts, and permanent errors at once', async () => {
    class Invalid extends Error {}
    const { s, h, worker } = setup({ maxAttempts: 3, isPermanent: (e) => e instanceof Invalid });
    s.add('email', {}, 3);
    s.add('email', {}, 1);
    worker.start();
    await flush();
    h.calls.get('j1').reject(new Error('still down'));
    h.calls.get('j2').reject(new Invalid('no such address'));
    await flush();
    expect(s.of('bury')).toEqual([
      ['bury', 'j1', 't-j1', { reason: 'max-attempts', error: 'still down' }],
      ['bury', 'j2', 't-j2', { reason: 'permanent', error: 'no such address' }],
    ]);
    expect(s.of('release')).toEqual([]);
  });

  it('buries an unknown type, and treats a synchronous throw as a failure', async () => {
    const s = fakeStore();
    const timers = fakeTimers();
    const worker = solution.createWorker({
      store: s.store, timers,
      handlers: { sync: () => { throw new Error('sync boom'); } },
    });
    s.add('nope', {});
    s.add('toString', {});
    s.add('sync', {});
    worker.start();
    await flush();
    const buried = s.of('bury');
    expect(buried.map((e) => [e[1], e[3].reason])).toEqual([['j1', 'unknown-type'], ['j2', 'unknown-type']]);
    expect(typeof buried[0][3].error).toBe('string');
    expect(s.of('release')).toEqual([['release', 'j3', 't-j3', { delayMs: 1000 }]]);
  });

  it('keeps going when the store fails to record an outcome', async () => {
    const { s, h, worker } = setup({ concurrency: 1 }, { failComplete: true });
    s.add('email', 1);
    s.add('email', 2);
    worker.start();
    await flush();
    h.calls.get('j1').resolve();
    await flush();
    expect(h.calls.has('j2')).toBe(true);
  });
});

describe('heartbeats', () => {
  it('beats every heartbeatMs while the job runs, and stops when it settles', async () => {
    const { s, h, timers, worker } = setup();
    s.add('email', {});
    worker.start();
    await flush();
    expect(timers.count(10_000)).toBe(1);
    await timers.fire(10_000);
    await timers.fire(10_000);
    expect(s.of('heartbeat')).toEqual([['heartbeat', 'j1', 't-j1'], ['heartbeat', 'j1', 't-j1']]);
    expect(timers.count(10_000)).toBe(1);
    h.calls.get('j1').resolve();
    await flush();
    expect(timers.count(10_000)).toBe(0);
  });

  it('on a lost lease: aborts the signal, ignores the result, and frees the slot', async () => {
    const { s, h, timers, worker } = setup({ concurrency: 1 }, { failHeartbeat: (id) => id === 'j1' });
    s.add('email', 1);
    s.add('email', 2);
    worker.start();
    await flush();
    const first = h.calls.get('j1');
    await timers.fire(10_000);
    expect(first.ctx.signal.aborted).toBe(true);
    expect(h.calls.has('j2')).toBe(true);        // slot refilled
    first.resolve();                              // the zombie finishes anyway
    await flush();
    expect(s.of('complete')).toEqual([]);
    expect(s.of('release')).toEqual([]);
    expect(timers.count(10_000)).toBe(1);         // only j2's heartbeat
  });
});

describe('stop', () => {
  it('resolves at once when idle, and never claims again', async () => {
    const { s, timers, worker } = setup();
    worker.start();
    await flush();
    expect(await worker.stop()).toStrictEqual({ released: 0 });
    expect(timers.count(1000)).toBe(0);
    s.add('email', {});
    await timers.fire(1000);
    expect(s.of('claim')).toHaveLength(1);
  });

  it('waits for running jobs to finish normally within the grace period', async () => {
    const { s, h, timers, worker } = setup();
    s.add('email', 1);
    s.add('email', 2);
    s.add('email', 3);
    worker.start();
    await flush();
    let result;
    worker.stop({ graceMs: 5000 }).then((r) => { result = r; });
    await flush();
    expect(result).toBeUndefined();
    expect(timers.count(5000)).toBe(1);
    h.calls.get('j1').resolve();
    await flush();
    expect(result).toBeUndefined();
    expect(h.calls.has('j3')).toBe(false);        // no new work while stopping
    h.calls.get('j2').reject(new Error('x'));
    await flush();
    expect(result).toStrictEqual({ released: 0 });
    expect(timers.count(5000)).toBe(0);
    expect(s.of('complete').map((e) => e[1])).toEqual(['j1']);
    expect(s.of('release').map((e) => e[1])).toEqual(['j2']);
  });

  it('hands back jobs still running when the grace period ends', async () => {
    const { s, h, timers, worker } = setup();
    s.add('email', 1);
    s.add('report', 2);
    worker.start();
    await flush();
    let result;
    worker.stop().then((r) => { result = r; });
    await flush();
    h.calls.get('j1').resolve();
    await flush();
    await timers.fire(30_000);
    expect(result).toStrictEqual({ released: 1 });
    expect(h.calls.get('j2').ctx.signal.aborted).toBe(true);
    expect(s.of('release')).toEqual([['release', 'j2', 't-j2', { delayMs: 0 }]]);
    expect(timers.count(10_000)).toBe(0);
    h.calls.get('j2').resolve();                 // finishes after being handed back
    await flush();
    expect(s.of('complete').map((e) => e[1])).toEqual(['j1']);
    expect(worker.active).toBe(0);
  });

  it('releases a job whose claim was in flight when stop() was called', async () => {
    const { s, h, timers, worker } = setup();
    const held = s.holdNextClaim();
    worker.start();
    await flush();
    const stopping = worker.stop();
    held.resolve({ id: 'late', type: 'email', payload: {}, token: 't-late', attempt: 1 });
    expect(await stopping).toStrictEqual({ released: 1 });
    expect(h.calls.has('late')).toBe(false);
    expect(s.of('release')).toEqual([['release', 'late', 't-late', { delayMs: 0 }]]);
    expect(timers.count(1000)).toBe(0);
  });
});
