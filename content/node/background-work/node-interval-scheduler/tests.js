const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

/** A manual clock with timers that fire when the clock is advanced past them. */
function fakeTime(start = 1_000_000) {
  const clock = { t: start };
  const pending = new Map();
  let seq = 0;
  const timers = {
    setTimeout(fn, ms) {
      if (!(ms >= 0)) throw new Error('bad delay ' + ms);
      const handle = { id: ++seq, at: clock.t + ms, ms };
      pending.set(handle, fn);
      return handle;
    },
    clearTimeout(handle) { pending.delete(handle); },
  };
  /** Move time forward, firing due timers in order, letting promises settle after each. */
  async function advance(ms) {
    const target = clock.t + ms;
    await flush();
    for (;;) {
      const due = [...pending.keys()].filter((h) => h.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      clock.t = Math.max(clock.t, due.at);
      const fn = pending.get(due);
      pending.delete(due);
      fn();
      await flush();
    }
    clock.t = target;
    await flush();
  }
  /** Jump the clock without firing anything (the process was asleep). */
  const sleep = (ms) => { clock.t += ms; };
  return { now: () => clock.t, timers, advance, sleep, pending, clock };
}

const setup = (options = {}) => {
  const time = fakeTime();
  const errors = [];
  const s = solution.createScheduler({ now: time.now, timers: time.timers, onError: (name, e) => errors.push([name, e.message]), ...options });
  return { s, time, errors };
};

/** A task that records start times and waits for the test to finish each run. */
function manualTask(time) {
  const runs = [];
  const task = () => new Promise((resolve, reject) => { runs.push({ at: time.clock.t, resolve, reject }); });
  return { task, runs };
}

describe('scheduling', () => {
  it('first runs one interval after every(), then on each interval', async () => {
    const { s, time } = setup();
    const starts = [];
    s.every('rates', 1000, () => { starts.push(time.clock.t - 1_000_000); });
    await time.advance(999);
    expect(starts).toEqual([]);
    await time.advance(1);
    expect(starts).toEqual([1000]);
    await time.advance(2000);
    expect(starts).toEqual([1000, 2000, 3000]);
    expect(s.stats('rates')).toStrictEqual({ runs: 3, skipped: 0, failures: 0 });
  });

  it('does not drift when runs take time', async () => {
    const { s, time } = setup();
    const t = manualTask(time);
    s.every('rates', 1000, t.task);
    await time.advance(1000);
    await time.advance(300);
    t.runs[0].resolve();              // the first run took 300 ms
    await time.advance(700);
    expect(t.runs.map((r) => r.at - 1_000_000)).toEqual([1000, 2000]);
    t.runs[1].resolve();
    await time.advance(1000);
    expect(t.runs.map((r) => r.at - 1_000_000)).toEqual([1000, 2000, 3000]);
  });

  it('runs tasks independently of each other', async () => {
    const { s, time } = setup();
    const a = [];
    const b = [];
    s.every('a', 300, () => { a.push(time.clock.t - 1_000_000); });
    s.every('b', 500, () => { b.push(time.clock.t - 1_000_000); });
    await time.advance(1000);
    expect(a).toEqual([300, 600, 900]);
    expect(b).toEqual([500, 1000]);
  });

  it('validates its arguments', () => {
    const { s } = setup();
    for (const bad of [0, -5, 1.5, NaN, '1000']) expect(() => s.every('x' + String(bad), bad, () => {})).toThrow(RangeError);
    s.every('dup', 1000, () => {});
    expect(() => s.every('dup', 1000, () => {})).toThrow(Error);
  });
});

describe('overlap', () => {
  it('skips a tick while the previous run is still going, and counts it', async () => {
    const { s, time } = setup();
    const t = manualTask(time);
    s.every('rates', 1000, t.task);
    await time.advance(1000);
    await time.advance(2000);         // ticks at 2000 and 3000 find run 1 still going
    expect(t.runs).toHaveLength(1);
    expect(s.stats('rates')).toStrictEqual({ runs: 1, skipped: 2, failures: 0 });
    t.runs[0].resolve();
    await time.advance(500);
    expect(t.runs).toHaveLength(1);   // no catch-up run the moment it finishes
    await time.advance(500);
    expect(t.runs.map((r) => r.at - 1_000_000)).toEqual([1000, 4000]);
  });
});

describe('late timers', () => {
  it('runs once after a long sleep, then returns to the original grid', async () => {
    const { s, time } = setup();
    const starts = [];
    s.every('rates', 1000, () => { starts.push(time.clock.t - 1_000_000); });
    await time.advance(1000);
    time.sleep(5500);                 // the timer due at 2000 fires at 6500
    await time.advance(0);
    expect(starts).toEqual([1000, 6500]);
    await time.advance(499);
    expect(starts).toEqual([1000, 6500]);
    await time.advance(1);
    expect(starts).toEqual([1000, 6500, 7000]);
    expect(s.stats('rates').runs).toBe(3);
  });

  it('never asks for a negative delay', async () => {
    const { s, time } = setup();
    s.every('rates', 100, () => {});
    time.sleep(10_000);
    await time.advance(0);
    await time.advance(300);
    for (const h of time.pending.keys()) expect(h.ms).toBeGreaterThanOrEqual(0);
  });
});

describe('errors', () => {
  it('reports rejections and synchronous throws, and keeps the schedule', async () => {
    const { s, time, errors } = setup();
    let n = 0;
    s.every('flaky', 1000, () => {
      n++;
      if (n === 1) throw new Error('sync boom');
      if (n === 2) return Promise.reject(new Error('async boom'));
    });
    await time.advance(3000);
    expect(n).toBe(3);
    expect(errors).toEqual([['flaky', 'sync boom'], ['flaky', 'async boom']]);
    expect(s.stats('flaky')).toStrictEqual({ runs: 3, skipped: 0, failures: 2 });
  });
});

describe('stop', () => {
  it('cancels pending timers and waits for in-flight runs', async () => {
    const { s, time } = setup();
    const t = manualTask(time);
    s.every('rates', 1000, t.task);
    s.every('other', 700, () => {});
    await time.advance(1000);
    expect(t.runs).toHaveLength(1);
    let stopped = false;
    const p = s.stop().then(() => { stopped = true; });
    await flush();
    expect(time.pending.size).toBe(0);
    expect(stopped).toBe(false);
    t.runs[0].resolve();
    await p;
    expect(stopped).toBe(true);
    await time.advance(5000);
    expect(t.runs).toHaveLength(1);
    expect(() => s.every('late', 1000, () => {})).toThrow(Error);
  });

  it('resolves even if the in-flight run fails', async () => {
    const { s, time } = setup();
    const t = manualTask(time);
    s.every('rates', 1000, t.task);
    await time.advance(1000);
    const p = s.stop();
    t.runs[0].reject(new Error('late failure'));
    await p;
  });
});
