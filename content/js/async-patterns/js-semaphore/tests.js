const { Semaphore } = solution;
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('construction', () => {
  it('rejects a permit count that is not a positive integer', () => {
    for (const bad of [0, -1, 1.5, NaN, '2']) {
      expect(() => new Semaphore(bad)).toThrow(RangeError);
    }
  });

  it('starts with every permit available and nobody waiting', () => {
    const s = new Semaphore(3);
    expect(s.available).toBe(3);
    expect(s.waiting).toBe(0);
  });
});

describe('acquire and release', () => {
  it('grants up to `permits` immediately, then queues', async () => {
    const s = new Semaphore(2);
    const r1 = await s.acquire();
    const r2 = await s.acquire();
    expect(typeof r1).toBe('function');
    expect(s.available).toBe(0);
    let third = false;
    const p3 = s.acquire().then((r) => { third = true; return r; });
    await tick();
    expect(third).toBe(false);
    expect(s.waiting).toBe(1);
    r1();
    const r3 = await p3;
    expect(third).toBe(true);
    r2();
    r3();
    expect(s.available).toBe(2);
  });

  it('a release function called twice returns only one permit', async () => {
    const s = new Semaphore(1);
    const release = await s.acquire();
    release();
    release();
    expect(s.available).toBe(1);
    const a = await s.acquire();
    let second = false;
    s.acquire().then(() => { second = true; });
    await tick();
    expect(second).toBe(false);
    a();
    await tick();
    expect(second).toBe(true);
  });

  it('serves waiters in FIFO order', async () => {
    const s = new Semaphore(1);
    const first = await s.acquire();
    const order = [];
    const ps = ['a', 'b', 'c'].map((name) => s.acquire().then((release) => {
      order.push(name);
      release();
    }));
    first();
    await Promise.all(ps);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('hands a released permit straight to the next waiter (no barging)', async () => {
    const s = new Semaphore(1);
    const holder = await s.acquire();
    const order = [];
    const waiter = s.acquire().then((release) => { order.push('waiter'); release(); });
    await tick();
    holder();
    expect(s.available).toBe(0);
    const newcomer = s.acquire().then((release) => { order.push('newcomer'); release(); });
    await Promise.all([waiter, newcomer]);
    expect(order).toEqual(['waiter', 'newcomer']);
    expect(s.available).toBe(1);
  });
});

describe('use', () => {
  it('returns the result and never exceeds the limit', async () => {
    const s = new Semaphore(3);
    let inFlight = 0;
    let peak = 0;
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => s.use(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return i * 2;
    })));
    expect(peak).toBe(3);
    expect(results).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(s.available).toBe(3);
  });

  it('releases when fn rejects, and rethrows', async () => {
    const s = new Semaphore(1);
    await expect(s.use(async () => { throw new Error('upstream 503'); })).rejects.toThrow('upstream 503');
    expect(s.available).toBe(1);
  });

  it('releases when fn throws synchronously, and rethrows', async () => {
    const s = new Semaphore(1);
    await expect(s.use(() => { throw new TypeError('bad input'); })).rejects.toThrow('bad input');
    expect(s.available).toBe(1);
    expect(await s.use(() => 'still usable')).toBe('still usable');
  });
});

describe('abort', () => {
  it('rejects at once with the reason when the signal is already aborted', async () => {
    const s = new Semaphore(1);
    const reason = new Error('already gone');
    await expect(s.acquire({ signal: AbortSignal.abort(reason) })).rejects.toThrow('already gone');
    expect(s.available).toBe(1);
  });

  it('removes an aborted waiter from the queue', async () => {
    const s = new Semaphore(1);
    const holder = await s.acquire();
    const ac = new AbortController();
    const aborted = s.acquire({ signal: ac.signal });
    const order = [];
    const later = s.acquire().then((release) => { order.push('later'); return release; });
    await tick();
    expect(s.waiting).toBe(2);
    ac.abort(new Error('user left'));
    await expect(aborted).rejects.toThrow('user left');
    expect(s.waiting).toBe(1);
    holder();
    const release = await later;
    expect(order).toEqual(['later']);
    release();
    expect(s.available).toBe(1);
  });

  it('ignores an abort that arrives after the permit was granted', async () => {
    const s = new Semaphore(1);
    const holder = await s.acquire();
    const ac = new AbortController();
    const p = s.acquire({ signal: ac.signal });
    holder();
    const release = await p;
    ac.abort(new Error('too late'));
    await tick();
    expect(s.available).toBe(0);
    release();
    expect(s.available).toBe(1);
    expect(s.waiting).toBe(0);
  });
});
