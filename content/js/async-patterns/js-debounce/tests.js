const { debounce } = solution;

// A fake clock: timers fire only when the test advances time.
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

function recorder() {
  const calls = [];
  const fn = function (...args) { calls.push(args); return `ran ${args.join(',')}`; };
  return { fn, calls };
}

describe('trailing (default)', () => {
  it('runs once after the calls stop, with the last arguments', () => {
    const t = fakeTimers();
    const { fn, calls } = recorder();
    const d = debounce(fn, 100, { timers: t });
    d('k'); t.advance(50);
    d('ke'); t.advance(50);
    d('key');
    t.advance(99);
    expect(calls).toEqual([]);
    t.advance(1);
    expect(calls).toEqual([['key']]);
  });

  it('every call restarts the wait', () => {
    const t = fakeTimers();
    const { fn, calls } = recorder();
    const d = debounce(fn, 100, { timers: t });
    for (let i = 0; i < 10; i++) { d(i); t.advance(90); }
    expect(calls).toEqual([]);
    t.advance(10);
    expect(calls).toEqual([[9]]);
  });

  it('separate bursts each produce a call', () => {
    const t = fakeTimers();
    const { fn, calls } = recorder();
    const d = debounce(fn, 100, { timers: t });
    d('a'); t.advance(100);
    d('b'); t.advance(100);
    expect(calls).toEqual([['a'], ['b']]);
  });

  it('keeps `this` from the latest call', () => {
    const t = fakeTimers();
    const seen = [];
    const form = {
      name: 'profile',
      save: debounce(function () { seen.push(this.name); }, 50, { timers: t }),
    };
    form.save();
    t.advance(50);
    expect(seen).toEqual(['profile']);
  });

  it('returns undefined from the debounced call and leaves no timer behind', () => {
    const t = fakeTimers();
    const { fn } = recorder();
    const d = debounce(fn, 100, { timers: t });
    expect(d(1)).toBeUndefined();
    d(2); d(3);
    expect(t.active).toBe(1);
    t.advance(100);
    expect(t.active).toBe(0);
  });
});

describe('leading', () => {
  it('leading only: runs on the first call and ignores the rest of the burst', () => {
    const t = fakeTimers();
    const { fn, calls } = recorder();
    const d = debounce(fn, 100, { leading: true, trailing: false, timers: t });
    d('a'); d('b'); t.advance(50); d('c');
    expect(calls).toEqual([['a']]);
    t.advance(100);
    expect(calls).toEqual([['a']]);
    d('d');
    expect(calls).toEqual([['a'], ['d']]);
  });

  it('leading + trailing: a single call runs exactly once', () => {
    const t = fakeTimers();
    const { fn, calls } = recorder();
    const d = debounce(fn, 100, { leading: true, trailing: true, timers: t });
    d('only');
    t.advance(500);
    expect(calls).toEqual([['only']]);
  });

  it('leading + trailing: a burst runs at the start and at the end', () => {
    const t = fakeTimers();
    const { fn, calls } = recorder();
    const d = debounce(fn, 100, { leading: true, trailing: true, timers: t });
    d(1); t.advance(10); d(2); t.advance(10); d(3);
    expect(calls).toEqual([[1]]);
    t.advance(100);
    expect(calls).toEqual([[1], [3]]);
  });
});

describe('cancel and flush', () => {
  it('cancel drops the pending call', () => {
    const t = fakeTimers();
    const { fn, calls } = recorder();
    const d = debounce(fn, 100, { timers: t });
    d('draft');
    d.cancel();
    t.advance(1000);
    expect(calls).toEqual([]);
    expect(t.active).toBe(0);
  });

  it('after cancel, the next call starts a fresh burst (leading fires again)', () => {
    const t = fakeTimers();
    const { fn, calls } = recorder();
    const d = debounce(fn, 100, { leading: true, trailing: true, timers: t });
    d('a'); d('b');
    d.cancel();
    d('c');
    expect(calls).toEqual([['a'], ['c']]);
  });

  it('flush runs the pending call now and returns its result', () => {
    const t = fakeTimers();
    const { fn, calls } = recorder();
    const d = debounce(fn, 100, { timers: t });
    d('x', 'y');
    expect(d.flush()).toBe('ran x,y');
    expect(calls).toEqual([['x', 'y']]);
    t.advance(1000);
    expect(calls).toEqual([['x', 'y']]);
    expect(t.active).toBe(0);
  });

  it('flush with nothing pending does nothing', () => {
    const t = fakeTimers();
    const { fn, calls } = recorder();
    const d = debounce(fn, 100, { timers: t });
    expect(d.flush()).toBeUndefined();
    d('a');
    t.advance(100);
    expect(d.flush()).toBeUndefined();
    expect(calls).toEqual([['a']]);
  });
});
