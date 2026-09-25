const { throttle } = solution;

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
    get now() { return now; },
    get active() { return pending.size; },
  };
}

function setup(wait = 100) {
  const t = fakeTimers();
  const runs = [];
  const th = throttle((...args) => { runs.push({ at: t.now, args }); }, wait, { timers: t });
  return { t, runs, th };
}

describe('throttle', () => {
  it('runs the first call immediately', () => {
    const { runs, th } = setup();
    expect(th('first')).toBeUndefined();
    expect(runs).toEqual([{ at: 0, args: ['first'] }]);
  });

  it('delivers the latest call made during the window when it closes', () => {
    const { t, runs, th } = setup();
    th(0);
    t.advance(20); th(20);
    t.advance(20); th(40);
    t.advance(60);
    expect(runs).toEqual([{ at: 0, args: [0] }, { at: 100, args: [40] }]);
  });

  it('never runs twice within `wait`, even for the trailing run', () => {
    const { t, runs, th } = setup();
    th('a');
    t.advance(50); th('b');
    t.advance(50); // trailing run of 'b' at 100
    t.advance(10); th('c'); // inside the window opened by the trailing run
    t.advance(89);
    expect(runs.map((r) => r.args[0])).toEqual(['a', 'b']);
    t.advance(1);
    expect(runs).toEqual([
      { at: 0, args: ['a'] },
      { at: 100, args: ['b'] },
      { at: 200, args: ['c'] },
    ]);
  });

  it('keeps a steady rhythm under continuous calls', () => {
    const { t, runs, th } = setup();
    for (let ms = 0; ms <= 1000; ms += 10) {
      th(ms);
      t.advance(10);
    }
    t.advance(200);
    const times = runs.map((r) => r.at);
    expect(times).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100]);
    expect(runs[runs.length - 1].args).toEqual([1000]);
  });

  it('goes idle after a quiet window, and the next call is immediate', () => {
    const { t, runs, th } = setup();
    th('a');
    t.advance(500);
    expect(t.active).toBe(0);
    th('b');
    expect(runs).toEqual([{ at: 0, args: ['a'] }, { at: 500, args: ['b'] }]);
  });

  it('passes `this` through, for both immediate and trailing runs', () => {
    const t = fakeTimers();
    const seen = [];
    const tracker = {
      id: 'tracker',
      report: throttle(function (y) { seen.push(`${this.id}:${y}`); }, 100, { timers: t }),
    };
    tracker.report(1);
    tracker.report(2);
    t.advance(100);
    expect(seen).toEqual(['tracker:1', 'tracker:2']);
  });

  it('cancel drops the kept call and closes the window', () => {
    const { t, runs, th } = setup();
    th('a');
    th('b');
    th.cancel();
    expect(t.active).toBe(0);
    t.advance(1000);
    expect(runs.map((r) => r.args[0])).toEqual(['a']);
    th('c');
    expect(runs.map((r) => r.args[0])).toEqual(['a', 'c']);
  });
});
