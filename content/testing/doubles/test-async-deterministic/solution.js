/** A fake scheduler: timers run only when you advance its clock. */
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeout: (callback, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimeout: (id) => { timers.delete(id); },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
        if (!due.length) break;
        const [id, t] = due[0];
        timers.delete(id);
        now = t.at;
        t.callback();
      }
      now = until;
    },
  };
}

/** A fn that rejects `failures` times, then resolves 'done'. Records every attempt number. */
function flaky(failures) {
  const calls = [];
  const fn = async (attempt) => {
    calls.push(attempt);
    if (calls.length <= failures) throw new Error(`failure ${calls.length}`);
    return 'done';
  };
  return { fn, calls };
}

/** A sleep that records the delay and resolves immediately. */
function recordingSleep() {
  const delays = [];
  return { sleep: async (ms) => { delays.push(ms); }, delays };
}

describe('retry', () => {
  it('resolves with the value once an attempt succeeds', async () => {
    const { fn, calls } = flaky(2);
    const { sleep } = recordingSleep();
    await expect(solution.retry(fn, { attempts: 3, sleep })).resolves.toBe('done');
    expect(calls).toEqual([1, 2, 3]);
  });

  it('backs off: delayMs, then double, between attempts', async () => {
    const { fn } = flaky(2);
    const { sleep, delays } = recordingSleep();
    await solution.retry(fn, { attempts: 3, delayMs: 100, sleep });
    expect(delays).toEqual([100, 200]);
  });

  it('makes at most `attempts` calls in total, then rejects with the last error', async () => {
    const { fn, calls } = flaky(10);
    const { sleep } = recordingSleep();
    await expect(solution.retry(fn, { attempts: 3, sleep })).rejects.toThrow('failure 3');
    expect(calls).toEqual([1, 2, 3]);
  });

  it('does not sleep after the final attempt', async () => {
    const { fn } = flaky(10);
    const { sleep, delays } = recordingSleep();
    await solution.retry(fn, { attempts: 3, delayMs: 50, sleep }).catch(() => {});
    expect(delays).toEqual([50, 100]);
  });

  it('with one attempt, never sleeps', async () => {
    const { fn, calls } = flaky(1);
    const { sleep, delays } = recordingSleep();
    await expect(solution.retry(fn, { attempts: 1, sleep })).rejects.toThrow('failure 1');
    expect(calls).toEqual([1]);
    expect(delays).toEqual([]);
  });
});

describe('debounce', () => {
  it('does not call fn during the burst', () => {
    const timers = fakeTimers();
    const calls = [];
    const debounced = solution.debounce((x) => calls.push(x), 100, timers);
    debounced('a');
    timers.advance(60);
    debounced('b');
    timers.advance(60); // 120 ms since the first call, 60 since the last
    expect(calls).toEqual([]);
  });

  it('calls fn once, ms after the last call, with the last arguments', () => {
    const timers = fakeTimers();
    const calls = [];
    const debounced = solution.debounce((...args) => calls.push(args), 100, timers);
    debounced('a', 1);
    debounced('b', 2);
    debounced('c', 3);
    timers.advance(99);
    expect(calls).toEqual([]);
    timers.advance(1);
    expect(calls).toEqual([['c', 3]]);
  });

  it('starts a new burst after going quiet', () => {
    const timers = fakeTimers();
    const calls = [];
    const debounced = solution.debounce((x) => calls.push(x), 100, timers);
    debounced('a');
    timers.advance(100);
    debounced('b');
    timers.advance(100);
    expect(calls).toEqual(['a', 'b']);
  });
});
