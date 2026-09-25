const flush = () => new Promise((r) => setImmediate(r));

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const fakeTimers = () => {
  let next = 0;
  const pending = new Map();
  return {
    setTimeout(fn, ms) { const id = ++next; pending.set(id, { fn, ms }); return id; },
    clearTimeout(id) { pending.delete(id); },
    fireAll() { for (const [id, t] of [...pending]) { pending.delete(id); t.fn(); } },
    pending,
  };
};

const outcome = (p) => p.then((v) => ({ ok: v }), (e) => ({ err: e }));

describe('createBulkhead', () => {
  it('validates its limits', () => {
    for (const opts of [{ maxConcurrent: 0 }, { maxConcurrent: 1.5 }, { maxConcurrent: '2' }, {}, { maxConcurrent: 1, maxQueue: -1 }, { maxConcurrent: 1, maxQueue: 0.5 }]) {
      expect(() => solution.createBulkhead(opts)).toThrow(RangeError);
    }
    expect(() => solution.createBulkhead({ maxConcurrent: 1 })).not.toThrow();
  });

  it('error classes have their names', () => {
    expect(new solution.BulkheadFullError()).toBeInstanceOf(Error);
    expect(new solution.BulkheadFullError().name).toBe('BulkheadFullError');
    expect(new solution.QueueTimeoutError().name).toBe('QueueTimeoutError');
  });
});

describe('run', () => {
  it('passes results and errors through', async () => {
    const b = solution.createBulkhead({ maxConcurrent: 2 });
    expect(await b.run(async () => 42)).toBe(42);
    expect(await b.run(() => 'sync')).toBe('sync');
    const boom = new Error('boom');
    await expect(b.run(async () => { throw boom; })).rejects.toThrow('boom');
    expect(b.stats()).toEqual({ active: 0, queued: 0 });
  });

  it('never throws synchronously, and frees the slot after a synchronous throw', async () => {
    const b = solution.createBulkhead({ maxConcurrent: 1 });
    let p;
    expect(() => { p = b.run(() => { throw new Error('sync boom'); }); }).not.toThrow();
    expect((await outcome(p)).err.message).toBe('sync boom');
    await flush();
    expect(await b.run(() => 'next')).toBe('next');
  });

  it('runs up to maxConcurrent at once and rejects the rest immediately without a queue', async () => {
    const b = solution.createBulkhead({ maxConcurrent: 2 });
    const d1 = deferred();
    const d2 = deferred();
    const p1 = b.run(() => d1.promise);
    const p2 = b.run(() => d2.promise);
    let called = false;
    const p3 = outcome(b.run(() => { called = true; }));
    expect(b.stats()).toEqual({ active: 2, queued: 0 });
    const r3 = await p3;
    expect(r3.err).toBeInstanceOf(solution.BulkheadFullError);
    expect(called).toBe(false);
    d1.resolve('a');
    d2.resolve('b');
    expect(await p1).toBe('a');
    expect(await p2).toBe('b');
  });

  it('queues up to maxQueue, FIFO, and starts each waiter when a slot frees', async () => {
    const b = solution.createBulkhead({ maxConcurrent: 1, maxQueue: 2 });
    const started = [];
    const gates = [deferred(), deferred(), deferred()];
    const ps = gates.map((g, i) => b.run(() => { started.push(i); return g.promise; }));
    const full = outcome(b.run(() => started.push('overflow')));
    expect(b.stats()).toEqual({ active: 1, queued: 2 });
    expect((await full).err).toBeInstanceOf(solution.BulkheadFullError);
    expect(started).toEqual([0]);
    gates[0].resolve('first');
    expect(await ps[0]).toBe('first');
    await flush();
    expect(started).toEqual([0, 1]);
    expect(b.stats()).toEqual({ active: 1, queued: 1 });
    gates[1].reject(new Error('second failed'));
    expect((await outcome(ps[1])).err.message).toBe('second failed');
    await flush();
    expect(started).toEqual([0, 1, 2]);
    gates[2].resolve('third');
    expect(await ps[2]).toBe('third');
    await flush();
    expect(b.stats()).toEqual({ active: 0, queued: 0 });
  });

  it('rejects immediately once the queue is full, and accepts again when it drains', async () => {
    const b = solution.createBulkhead({ maxConcurrent: 1, maxQueue: 1 });
    const g = deferred();
    b.run(() => g.promise);
    const queued = b.run(() => 'queued');
    expect((await outcome(b.run(() => 'x'))).err).toBeInstanceOf(solution.BulkheadFullError);
    g.resolve();
    expect(await queued).toBe('queued');
    await flush();
    expect(await b.run(() => 'fresh')).toBe('fresh');
  });

  it('times a waiter out of the queue without ever calling it', async () => {
    const timers = fakeTimers();
    const b = solution.createBulkhead({ maxConcurrent: 1, maxQueue: 2, queueTimeoutMs: 500, timers });
    const g = deferred();
    b.run(() => g.promise);
    let called = false;
    const waiting = outcome(b.run(() => { called = true; }));
    expect(timers.pending.size).toBe(1);
    expect([...timers.pending.values()][0].ms).toBe(500);
    timers.fireAll();
    const r = await waiting;
    expect(r.err).toBeInstanceOf(solution.QueueTimeoutError);
    expect(b.stats()).toEqual({ active: 1, queued: 0 });
    g.resolve();
    await flush();
    await flush();
    expect(called).toBe(false);
    expect(b.stats()).toEqual({ active: 0, queued: 0 });
  });

  it('clears the queue timer when a waiter gets its slot', async () => {
    const timers = fakeTimers();
    const b = solution.createBulkhead({ maxConcurrent: 1, maxQueue: 1, queueTimeoutMs: 500, timers });
    const g = deferred();
    b.run(() => g.promise);
    const waiting = b.run(() => 'got in');
    g.resolve();
    expect(await waiting).toBe('got in');
    expect(timers.pending.size).toBe(0);
  });

  it('sets no timer when queueTimeoutMs is not finite', async () => {
    const timers = fakeTimers();
    const b = solution.createBulkhead({ maxConcurrent: 1, maxQueue: 1, timers });
    const g = deferred();
    b.run(() => g.promise);
    const waiting = b.run(() => 'ok');
    expect(timers.pending.size).toBe(0);
    g.resolve();
    expect(await waiting).toBe('ok');
  });

  it('keeps separate bulkheads independent', async () => {
    const slow = solution.createBulkhead({ maxConcurrent: 1 });
    const fast = solution.createBulkhead({ maxConcurrent: 1 });
    const g = deferred();
    slow.run(() => g.promise);
    expect((await outcome(slow.run(() => 1))).err).toBeInstanceOf(solution.BulkheadFullError);
    expect(await fast.run(() => 'still fine')).toBe('still fine');
    g.resolve();
  });
});
