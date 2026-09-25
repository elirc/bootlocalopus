const { withTimeout, TimeoutError } = solution;
const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout(cb, ms = 0) {
      const id = nextId++;
      pending.set(id, { at: now + ms, cb });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let due = null;
        for (const [id, t] of pending) {
          if (t.at <= target && (!due || t.at < due[1].at)) due = [id, t];
        }
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].cb();
      }
      now = target;
    },
    get active() { return pending.size; },
  };
}

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

// A parent signal that counts listeners added and removed.
function countedController() {
  const ac = new AbortController();
  const live = new Set();
  const add = ac.signal.addEventListener.bind(ac.signal);
  const remove = ac.signal.removeEventListener.bind(ac.signal);
  ac.signal.addEventListener = (type, fn, opts) => { if (type === 'abort') live.add(fn); add(type, fn, opts); };
  ac.signal.removeEventListener = (type, fn, opts) => { if (type === 'abort') live.delete(fn); remove(type, fn, opts); };
  return { ac, live };
}

describe('TimeoutError', () => {
  it('is an Error named TimeoutError', () => {
    const e = new TimeoutError('x');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('TimeoutError');
    expect(e.message).toBe('x');
  });
});

describe('work finishes first', () => {
  it('resolves with the result and clears the timer', async () => {
    const t = fakeTimers();
    const r = await withTimeout(async (signal) => `ok:${signal.aborted}`, 1000, { timers: t });
    expect(r).toBe('ok:false');
    await tick();
    expect(t.active).toBe(0);
  });

  it('rejects with the work\'s own error and clears the timer', async () => {
    const t = fakeTimers();
    await expect(withTimeout(async () => { throw new Error('404'); }, 1000, { timers: t })).rejects.toThrow('404');
    await tick();
    expect(t.active).toBe(0);
  });

  it('turns a synchronous throw into a rejection', async () => {
    const t = fakeTimers();
    let p;
    expect(() => { p = withTimeout(() => { throw new TypeError('sync'); }, 1000, { timers: t }); }).not.toThrow();
    await expect(p).rejects.toThrow('sync');
    await tick();
    expect(t.active).toBe(0);
  });

  it('a late timer tick changes nothing', async () => {
    const t = fakeTimers();
    let inner;
    const p = withTimeout(async (signal) => { inner = signal; return 'done'; }, 100, { timers: t });
    expect(await p).toBe('done');
    await tick();
    t.advance(1000);
    expect(inner.aborted).toBe(false);
  });
});

describe('timeout fires first', () => {
  it('rejects with a TimeoutError and aborts the work\'s signal, even if the work hangs', async () => {
    const t = fakeTimers();
    let inner;
    const p = track(withTimeout((signal) => { inner = signal; return new Promise(() => {}); }, 250, { timers: t }));
    await tick();
    t.advance(249);
    await tick();
    expect(p.state).toBe('pending');
    expect(inner.aborted).toBe(false);
    t.advance(1);
    await tick();
    expect(p.state).toBe('rejected');
    expect(p.error).toBeInstanceOf(TimeoutError);
    expect(p.error.message).toBe('timed out after 250ms');
    expect(inner.aborted).toBe(true);
    expect(inner.reason).toBe(p.error);
  });

  it('a result arriving after the timeout is ignored', async () => {
    const t = fakeTimers();
    const d = deferred();
    const p = track(withTimeout(() => d.promise, 10, { timers: t }));
    t.advance(10);
    d.resolve('too late');
    await tick();
    expect(p.error).toBeInstanceOf(TimeoutError);
  });
});

describe('composing with a parent signal', () => {
  it('does not call fn when the parent is already aborted', async () => {
    const t = fakeTimers();
    let called = false;
    const reason = new Error('client disconnected');
    await expect(withTimeout(() => { called = true; }, 100, { signal: AbortSignal.abort(reason), timers: t }))
      .rejects.toThrow('client disconnected');
    expect(called).toBe(false);
    expect(t.active).toBe(0);
  });

  it('a parent abort aborts the work with the parent\'s reason and clears the timer', async () => {
    const t = fakeTimers();
    const { ac } = countedController();
    let inner;
    const p = track(withTimeout((signal) => { inner = signal; return new Promise(() => {}); }, 1000, { signal: ac.signal, timers: t }));
    await tick();
    const reason = new Error('client went away');
    ac.abort(reason);
    await tick();
    expect(p.state).toBe('rejected');
    expect(p.error).toBe(reason);
    expect(inner.aborted).toBe(true);
    expect(inner.reason).toBe(reason);
    expect(t.active).toBe(0);
  });

  it('removes its listener from the parent when the work succeeds', async () => {
    const t = fakeTimers();
    const { ac, live } = countedController();
    for (let i = 0; i < 20; i++) {
      await withTimeout(async () => i, 1000, { signal: ac.signal, timers: t });
    }
    await tick();
    expect(live.size).toBe(0);
    expect(t.active).toBe(0);
  });

  it('removes its listener from the parent when the timeout fires', async () => {
    const t = fakeTimers();
    const { ac, live } = countedController();
    const p = withTimeout(() => new Promise(() => {}), 50, { signal: ac.signal, timers: t });
    t.advance(50);
    await expect(p).rejects.toThrow('timed out after 50ms');
    expect(live.size).toBe(0);
  });

  it('a parent abort after completion does not touch the finished work', async () => {
    const t = fakeTimers();
    const ac = new AbortController();
    let inner;
    await withTimeout(async (signal) => { inner = signal; }, 100, { signal: ac.signal, timers: t });
    ac.abort(new Error('later'));
    expect(inner.aborted).toBe(false);
  });
});
