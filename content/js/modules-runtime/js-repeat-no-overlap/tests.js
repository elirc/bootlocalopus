const { repeat } = solution;

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// Timers the test controls: nothing fires until fire() is called.
function fakeTimers() {
  const pending = new Map();
  let nextId = 1;
  return {
    pending,
    setTimeout(fn, ms) {
      const id = nextId++;
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    // Fire the only pending timer (the tests assert there is exactly one).
    async fire() {
      expect(pending.size).toBe(1);
      const [[id, { fn }]] = [...pending];
      pending.delete(id);
      fn();
      await flush();
    },
    delays: () => [...pending.values()].map((t) => t.ms),
  };
}

// A task whose runs the test finishes by hand.
function manualTask() {
  const runs = [];
  const task = ({ signal }) => {
    const d = deferred();
    runs.push({ ...d, signal });
    return d.promise;
  };
  return { task, runs };
}

async function settle(promise) {
  let state = 'pending';
  promise.then(() => { state = 'fulfilled'; }, () => { state = 'rejected'; });
  await flush();
  return state;
}

describe('scheduling', () => {
  it('waits one interval before the first run', () => {
    const timers = fakeTimers();
    const { task, runs } = manualTask();
    repeat(task, 5000, { timers });
    expect(runs).toHaveLength(0);
    expect(timers.delays()).toEqual([5000]);
  });

  it('never overlaps: the next run is scheduled only after this one settles', async () => {
    const timers = fakeTimers();
    const { task, runs } = manualTask();
    repeat(task, 5000, { timers });
    await timers.fire();
    expect(runs).toHaveLength(1);
    await flush();
    expect(timers.pending.size).toBe(0); // no timer while a run is in progress
    runs[0].resolve();
    await flush();
    expect(timers.delays()).toEqual([5000]);
    await timers.fire();
    expect(runs).toHaveLength(2);
  });

  it('passes an AbortSignal to every run', async () => {
    const timers = fakeTimers();
    const { task, runs } = manualTask();
    repeat(task, 10, { timers });
    await timers.fire();
    expect(runs[0].signal).toBeInstanceOf(AbortSignal);
    expect(runs[0].signal.aborted).toBe(false);
  });

  it('handles a synchronous task', async () => {
    const timers = fakeTimers();
    let calls = 0;
    repeat(() => { calls++; }, 100, { timers });
    for (let i = 0; i < 3; i++) {
      await timers.fire();
      await flush();
    }
    expect(calls).toBe(3);
    expect(timers.delays()).toEqual([100]);
  });
});

describe('errors', () => {
  it('a rejected run goes to onError and the loop continues', async () => {
    const timers = fakeTimers();
    const errors = [];
    const { task, runs } = manualTask();
    repeat(task, 1000, { timers, onError: (e) => errors.push(e.message) });
    await timers.fire();
    runs[0].reject(new Error('supplier timeout'));
    await flush();
    expect(errors).toEqual(['supplier timeout']);
    expect(timers.delays()).toEqual([1000]);
    await timers.fire();
    expect(runs).toHaveLength(2);
  });

  it('a synchronous throw is handled the same way', async () => {
    const timers = fakeTimers();
    const errors = [];
    repeat(() => { throw new Error('bad config'); }, 1000, { timers, onError: (e) => errors.push(e.message) });
    await timers.fire();
    await flush();
    await timers.fire();
    await flush();
    expect(errors).toEqual(['bad config', 'bad config']);
    expect(timers.delays()).toEqual([1000]);
  });

  it('keeps going without an onError, and when onError itself throws', async () => {
    const timers = fakeTimers();
    let calls = 0;
    repeat(() => { calls++; return Promise.reject(new Error('x')); }, 10, { timers });
    await timers.fire();
    await flush();
    await timers.fire();
    await flush();
    expect(calls).toBe(2);

    const timers2 = fakeTimers();
    let calls2 = 0;
    repeat(() => { calls2++; throw new Error('y'); }, 10, { timers: timers2, onError: () => { throw new Error('logger down'); } });
    await timers2.fire();
    await flush();
    await timers2.fire();
    await flush();
    expect(calls2).toBe(2);
    expect(timers2.delays()).toEqual([10]);
  });
});

describe('stop', () => {
  it('clears the pending timer and resolves straight away when idle', async () => {
    const timers = fakeTimers();
    const { task, runs } = manualTask();
    const loop = repeat(task, 1000, { timers });
    const stopped = loop.stop();
    expect(timers.pending.size).toBe(0);
    expect(await settle(stopped)).toBe('fulfilled');
    expect(runs).toHaveLength(0);
  });

  it('aborts the running task and waits for it to settle', async () => {
    const timers = fakeTimers();
    const { task, runs } = manualTask();
    const loop = repeat(task, 1000, { timers });
    await timers.fire();
    const stopped = loop.stop();
    expect(runs[0].signal.aborted).toBe(true);
    expect(await settle(stopped)).toBe('pending');
    runs[0].resolve();
    expect(await settle(stopped)).toBe('fulfilled');
    expect(timers.pending.size).toBe(0); // nothing scheduled after the last run
  });

  it('never rejects, even if the last run fails', async () => {
    const timers = fakeTimers();
    const { task, runs } = manualTask();
    const loop = repeat(task, 1000, { timers, onError: () => {} });
    await timers.fire();
    const stopped = loop.stop();
    runs[0].reject(new Error('aborted mid-way'));
    expect(await settle(stopped)).toBe('fulfilled');
    expect(timers.pending.size).toBe(0);
  });

  it('calling stop twice is harmless', async () => {
    const timers = fakeTimers();
    const { task, runs } = manualTask();
    const loop = repeat(task, 1000, { timers });
    await timers.fire();
    const a = loop.stop();
    const b = loop.stop();
    runs[0].resolve();
    expect(await settle(a)).toBe('fulfilled');
    expect(await settle(b)).toBe('fulfilled');
    expect(await settle(loop.stop())).toBe('fulfilled');
  });

  it('works with real timers', async () => {
    let calls = 0;
    let loop;
    const third = deferred();
    loop = repeat(async () => {
      calls++;
      if (calls === 3) third.resolve();
    }, 1);
    await third.promise;
    await loop.stop();
    const after = calls;
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(after);
  });
});
