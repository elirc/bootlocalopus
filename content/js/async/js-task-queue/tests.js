const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('TaskQueue basics', () => {
  it('resolves each task with its own result', async () => {
    const q = new solution.TaskQueue({ concurrency: 2 });
    const results = await Promise.all([
      q.push(async () => 'a'),
      q.push(async () => 'b'),
      q.push(async () => 'c'),
    ]);
    expect(results).toEqual(['a', 'b', 'c']);
  });

  it('starts tasks in FIFO order', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    const order = [];
    const ps = ['a', 'b', 'c'].map((name) => q.push(async () => { order.push(name); }));
    await Promise.all(ps);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('respects the concurrency limit', async () => {
    const q = new solution.TaskQueue({ concurrency: 3 });
    let inFlight = 0;
    let peak = 0;
    await Promise.all(Array.from({ length: 12 }, () => q.push(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await sleep(5);
      inFlight--;
    })));
    expect(peak).toBe(3);
  });

  it('reports size and running', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    const ps = [q.push(() => sleep(30)), q.push(() => sleep(1)), q.push(() => sleep(1))];
    await sleep(5);
    expect(q.running).toBe(1);
    expect(q.size).toBe(2);
    await Promise.all(ps);
    expect(q.running).toBe(0);
    expect(q.size).toBe(0);
  });

  it('keeps the pool busy rather than batching', async () => {
    // The first task hangs until released. The second slot must work through
    // every other task meanwhile. Structural, not wall-clock.
    const q = new solution.TaskQueue({ concurrency: 2 });
    let release;
    const gate = new Promise((r) => { release = r; });
    const started = [];
    const ps = [0, 1, 2, 3, 4, 5, 6].map((n) => q.push(async () => {
      started.push(n);
      if (n === 0) await gate;
      else await sleep(1);
      return n;
    }));
    try {
      const deadline = Date.now() + 1000;
      while (started.length < 7 && Date.now() < deadline) await sleep(5);
      expect(started).toEqual([0, 1, 2, 3, 4, 5, 6]);
    } finally {
      release();
    }
    expect(await Promise.all(ps)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('error isolation', () => {
  it('a failing task rejects only its own promise', async () => {
    const q = new solution.TaskQueue({ concurrency: 2 });
    const bad = q.push(async () => { throw new Error('task blew up'); });
    const good = q.push(async () => 'fine');
    await expect(bad).rejects.toThrow('task blew up');
    expect(await good).toBe('fine');
  });

  it('the queue keeps draining after a failure', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    const results = [];
    const ps = [
      q.push(async () => { throw new Error('nope'); }).catch(() => results.push('failed')),
      q.push(async () => { results.push('ran anyway'); }),
    ];
    await Promise.all(ps);
    expect(results).toEqual(['failed', 'ran anyway']);
  });

  it('handles a task that throws synchronously', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    await expect(q.push(() => { throw new Error('sync boom'); })).rejects.toThrow('sync boom');
    expect(await q.push(async () => 'still alive')).toBe('still alive');
  });
});

describe('onIdle', () => {
  it('resolves once everything finishes', async () => {
    const q = new solution.TaskQueue({ concurrency: 2 });
    let done = 0;
    for (let i = 0; i < 6; i++) q.push(async () => { await sleep(5); done++; }).catch(() => {});
    await q.onIdle();
    expect(done).toBe(6);
    expect(q.running).toBe(0);
  });

  it('resolves immediately when nothing is pending', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    let resolved = false;
    q.onIdle().then(() => { resolved = true; });
    await sleep(5);
    expect(resolved).toBe(true);
  });
});

describe('abort', () => {
  it('rejects queued tasks and never starts them', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    let startedSecond = false;
    const first = q.push(() => sleep(20));
    const second = q.push(async () => { startedSecond = true; });
    q.abort(new Error('user cancelled'));
    await expect(second).rejects.toThrow('user cancelled');
    await first.catch(() => {});
    expect(startedSecond).toBe(false);
  });

  it('signals running tasks', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    let sawAbort = false;
    const p = q.push(async (signal) => {
      await sleep(20);
      sawAbort = signal.aborted;
      return 'finished late';
    });
    await sleep(5);
    q.abort(new Error('stop'));
    await p.catch(() => {});
    expect(sawAbort).toBe(true);
  });

  it('rejects tasks pushed after an abort', async () => {
    const q = new solution.TaskQueue({ concurrency: 1 });
    q.abort(new Error('closed'));
    await expect(q.push(async () => 'nope')).rejects.toThrow('closed');
  });
});