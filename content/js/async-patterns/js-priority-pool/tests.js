const { PriorityPool } = solution;
const tick = () => new Promise((r) => setTimeout(r, 0));

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function track(p) {
  const s = { state: 'pending' };
  p.then((v) => { s.state = 'fulfilled'; s.value = v; }, (e) => { s.state = 'rejected'; s.error = e; });
  return s;
}

// Tasks that record when they start and finish only when the test says so.
function gatedTasks() {
  const started = [];
  const gates = new Map();
  const make = (name) => (signal) => {
    started.push(name);
    const d = deferred();
    gates.set(name, { ...d, signal });
    return d.promise;
  };
  const finish = async (name, value = name) => { gates.get(name).resolve(value); await tick(); };
  return { started, gates, make, finish };
}

describe('construction and limits', () => {
  it('rejects a bad concurrency', () => {
    for (const bad of [0, -2, 1.5, NaN]) {
      expect(() => new PriorityPool({ concurrency: bad })).toThrow(RangeError);
    }
    const pool = new PriorityPool();
    expect(() => pool.setConcurrency(0)).toThrow(RangeError);
  });

  it('never runs more than `concurrency` tasks, and keeps slots busy', async () => {
    const pool = new PriorityPool({ concurrency: 2 });
    const g = gatedTasks();
    const ps = ['a', 'b', 'c', 'd'].map((n) => pool.run(g.make(n)));
    await tick();
    expect(g.started).toEqual(['a', 'b']);
    expect(pool.running).toBe(2);
    expect(pool.size).toBe(2);
    await g.finish('b');
    expect(g.started).toEqual(['a', 'b', 'c']);
    await g.finish('a');
    await g.finish('c');
    await g.finish('d');
    expect(await Promise.all(ps)).toEqual(['a', 'b', 'c', 'd']);
    expect(pool.running).toBe(0);
  });
});

describe('priority', () => {
  it('starts the highest priority first, FIFO within a priority', async () => {
    const pool = new PriorityPool({ concurrency: 1 });
    const g = gatedTasks();
    pool.run(g.make('blocker'));
    const queued = [
      ['bg-1', -5], ['normal-1', 0], ['urgent-1', 10], ['normal-2', 0], ['bg-2', -5], ['urgent-2', 10], ['default'],
    ];
    for (const [name, priority] of queued) {
      pool.run(g.make(name), priority === undefined ? undefined : { priority });
    }
    await tick();
    await g.finish('blocker');
    for (const name of ['urgent-1', 'urgent-2', 'normal-1', 'normal-2', 'default', 'bg-1', 'bg-2']) {
      await g.finish(name);
    }
    expect(g.started).toEqual(['blocker', 'urgent-1', 'urgent-2', 'normal-1', 'normal-2', 'default', 'bg-1', 'bg-2']);
  });

  it('a late urgent task overtakes queued background work', async () => {
    const pool = new PriorityPool({ concurrency: 1 });
    const g = gatedTasks();
    pool.run(g.make('running'), { priority: -1 });
    for (let i = 0; i < 5; i++) pool.run(g.make(`bg-${i}`), { priority: -1 });
    await tick();
    pool.run(g.make('user'), { priority: 5 });
    await g.finish('running');
    expect(g.started).toEqual(['running', 'user']);
  });
});

describe('failures', () => {
  it('a failing task rejects only its own promise', async () => {
    const pool = new PriorityPool({ concurrency: 1 });
    const bad = pool.run(async () => { throw new Error('corrupt image'); });
    const sync = pool.run(() => { throw new TypeError('sync fail'); });
    const good = pool.run(async () => 'rendered');
    await expect(bad).rejects.toThrow('corrupt image');
    await expect(sync).rejects.toThrow('sync fail');
    expect(await good).toBe('rendered');
    await tick();
    expect(pool.running).toBe(0);
  });
});

describe('cancellation', () => {
  it('passes the caller\'s signal to the task', async () => {
    const pool = new PriorityPool();
    const ac = new AbortController();
    expect(await pool.run(async (signal) => signal === ac.signal, { signal: ac.signal })).toBe(true);
  });

  it('rejects at once for an already-aborted signal', async () => {
    const pool = new PriorityPool();
    let started = false;
    const reason = new Error('navigated away');
    await expect(pool.run(() => { started = true; }, { signal: AbortSignal.abort(reason) })).rejects.toThrow('navigated away');
    expect(started).toBe(false);
    expect(pool.size).toBe(0);
  });

  it('removes a queued task whose signal aborts', async () => {
    const pool = new PriorityPool({ concurrency: 1 });
    const g = gatedTasks();
    pool.run(g.make('blocker'));
    const ac = new AbortController();
    const cancelled = track(pool.run(g.make('page-thumbs'), { signal: ac.signal, priority: 9 }));
    pool.run(g.make('next'));
    await tick();
    expect(pool.size).toBe(2);
    ac.abort(new Error('user left the page'));
    await tick();
    expect(cancelled.state).toBe('rejected');
    expect(cancelled.error.message).toBe('user left the page');
    expect(pool.size).toBe(1);
    await g.finish('blocker');
    expect(g.started).toEqual(['blocker', 'next']);
  });

  it('does not interfere with a task that already started', async () => {
    const pool = new PriorityPool({ concurrency: 1 });
    const ac = new AbortController();
    const g = gatedTasks();
    const p = track(pool.run(g.make('job'), { signal: ac.signal }));
    await tick();
    ac.abort(new Error('too late'));
    await tick();
    expect(p.state).toBe('pending');
    expect(g.gates.get('job').signal.aborted).toBe(true);
    await g.finish('job', 'finished anyway');
    expect(p).toEqual({ state: 'fulfilled', value: 'finished anyway' });
  });

  it('clear rejects queued tasks only, and the pool stays usable', async () => {
    const pool = new PriorityPool({ concurrency: 1 });
    const g = gatedTasks();
    const running = pool.run(g.make('running'));
    const q1 = track(pool.run(g.make('q1')));
    const q2 = track(pool.run(g.make('q2')));
    await tick();
    const reason = new Error('shutting down');
    pool.clear(reason);
    await tick();
    expect(q1.error).toBe(reason);
    expect(q2.error).toBe(reason);
    expect(pool.size).toBe(0);
    await g.finish('running');
    expect(await running).toBe('running');
    expect(await pool.run(async () => 'after clear')).toBe('after clear');
    expect(g.started).toEqual(['running']);
  });

  it('removes its abort listener once a task leaves the queue', async () => {
    const pool = new PriorityPool({ concurrency: 1 });
    const ac = new AbortController();
    let live = 0;
    const add = ac.signal.addEventListener.bind(ac.signal);
    const remove = ac.signal.removeEventListener.bind(ac.signal);
    ac.signal.addEventListener = (t, fn, o) => { if (t === 'abort') live++; add(t, fn, o); };
    ac.signal.removeEventListener = (t, fn, o) => { if (t === 'abort') live--; remove(t, fn, o); };
    for (let i = 0; i < 10; i++) await pool.run(async () => i, { signal: ac.signal });
    expect(live).toBe(0);
  });
});

describe('control', () => {
  it('pause stops new starts; resume continues', async () => {
    const pool = new PriorityPool({ concurrency: 2 });
    const g = gatedTasks();
    pool.pause();
    pool.run(g.make('a'));
    pool.run(g.make('b'));
    pool.run(g.make('c'));
    await tick();
    expect(g.started).toEqual([]);
    expect(pool.size).toBe(3);
    pool.resume();
    await tick();
    expect(g.started).toEqual(['a', 'b']);
    pool.pause();
    await g.finish('a');
    expect(g.started).toEqual(['a', 'b']);
    pool.resume();
    await tick();
    expect(g.started).toEqual(['a', 'b', 'c']);
  });

  it('raising concurrency starts queued tasks immediately', async () => {
    const pool = new PriorityPool({ concurrency: 1 });
    const g = gatedTasks();
    ['a', 'b', 'c', 'd'].forEach((n) => pool.run(g.make(n)));
    await tick();
    expect(g.started).toEqual(['a']);
    pool.setConcurrency(3);
    await tick();
    expect(g.started).toEqual(['a', 'b', 'c']);
    expect(pool.running).toBe(3);
  });

  it('lowering concurrency lets running tasks finish and starts fewer', async () => {
    const pool = new PriorityPool({ concurrency: 3 });
    const g = gatedTasks();
    ['a', 'b', 'c', 'd', 'e'].forEach((n) => pool.run(g.make(n)));
    await tick();
    pool.setConcurrency(1);
    expect(pool.running).toBe(3);
    await g.finish('a');
    await g.finish('b');
    expect(g.started).toEqual(['a', 'b', 'c']);
    await g.finish('c');
    expect(g.started).toEqual(['a', 'b', 'c', 'd']);
    expect(pool.running).toBe(1);
  });

  it('onIdle resolves when everything is done, and waits while paused', async () => {
    const pool = new PriorityPool({ concurrency: 2 });
    const empty = track(pool.onIdle());
    await tick();
    expect(empty.state).toBe('fulfilled');

    pool.pause();
    let done = 0;
    for (let i = 0; i < 4; i++) pool.run(async () => { await tick(); done++; });
    const idle = track(pool.onIdle());
    await tick();
    await tick();
    expect(idle.state).toBe('pending');
    pool.resume();
    await pool.onIdle();
    expect(done).toBe(4);
    await tick();
    expect(idle.state).toBe('fulfilled');
  });

  it('onIdle resolves when the last queued task is cleared or aborted', async () => {
    const pool = new PriorityPool({ concurrency: 1 });
    pool.pause();
    const ac = new AbortController();
    pool.run(async () => 1, { signal: ac.signal }).catch(() => {});
    pool.run(async () => 2).catch(() => {});
    const idle = track(pool.onIdle());
    ac.abort(new Error('gone'));
    await tick();
    expect(idle.state).toBe('pending');
    pool.clear(new Error('cleared'));
    await tick();
    expect(idle.state).toBe('fulfilled');
  });
});
