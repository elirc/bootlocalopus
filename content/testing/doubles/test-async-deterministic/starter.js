// Every test has a 400 ms limit: control time, do not wait for it.

/** A fake scheduler: timers run only when you advance its clock. */
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const timers = new Map(); // id -> { at, callback }
  return {
    setTimeout: (callback, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimeout: (id) => { timers.delete(id); },
    /** Moves the clock forward, running every timer that falls due, in time order. */
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

describe('retry', () => {
  it('resolves with the value when the first attempt works', async () => {
    const value = await solution.retry(async () => 'ok', { sleep: async () => {} });
    expect(value).toBe('ok');
  });

  // TODO: a fn that fails N times and then succeeds; record the calls to fn and to sleep.
});

describe('debounce', () => {
  it('calls fn once after a burst goes quiet', () => {
    const timers = fakeTimers();
    const calls = [];
    const debounced = solution.debounce((x) => calls.push(x), 100, timers);
    debounced('a');
    debounced('b');
    timers.advance(100);
    expect(calls.length).toBe(1);
  });

  // TODO: with which arguments? And what has happened *before* the quiet period ends?
});
