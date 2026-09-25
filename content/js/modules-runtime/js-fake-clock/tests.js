const { createClock } = solution;

function thrown(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('expected a throw');
}

describe('time and ids', () => {
  it('starts at the given time and only moves on tick', () => {
    expect(createClock().now()).toBe(0);
    const clock = createClock({ now: 1_700_000_000_000 });
    expect(clock.now()).toBe(1_700_000_000_000);
    clock.tick(250);
    expect(clock.now()).toBe(1_700_000_000_250);
  });

  it('hands out unique numeric ids across timeouts and intervals', () => {
    const clock = createClock();
    const ids = [clock.setTimeout(() => {}, 10), clock.setInterval(() => {}, 10), clock.setTimeout(() => {}, 5)];
    expect(ids).toEqual([1, 2, 3]);
    expect(clock.pending()).toBe(3);
  });
});

describe('tick', () => {
  it('fires due timers in due order, ties in scheduling order, with args', () => {
    const clock = createClock();
    const log = [];
    clock.setTimeout((x) => log.push(['a', x, clock.now()]), 100, 'A');
    clock.setTimeout(() => log.push(['b', clock.now()]), 50);
    clock.setTimeout((x, y) => log.push(['c', x, y, clock.now()]), 100, 1, 2);
    expect(clock.tick(99)).toBe(1);
    expect(log).toEqual([['b', 50]]);
    expect(clock.tick(1)).toBe(2);
    expect(log).toEqual([['b', 50], ['a', 'A', 100], ['c', 1, 2, 100]]);
    expect(clock.pending()).toBe(0);
  });

  it('fires timers due exactly at the end of the window, and tick(0) runs zero-delay timers', () => {
    const clock = createClock();
    const log = [];
    clock.setTimeout(() => log.push('zero'));
    clock.setTimeout(() => log.push('ten'), 10);
    clock.tick(0);
    expect(log).toEqual(['zero']);
    clock.tick(10);
    expect(log).toEqual(['zero', 'ten']);
  });

  it('treats negative and NaN delays as 0', () => {
    const clock = createClock();
    const log = [];
    clock.setTimeout(() => log.push('neg'), -50);
    clock.setTimeout(() => log.push('nan'), NaN);
    clock.tick(0);
    expect(log).toEqual(['neg', 'nan']);
  });

  it('timers scheduled by a callback fire in the same tick when due inside the window', () => {
    const clock = createClock();
    const log = [];
    clock.setTimeout(() => {
      log.push(['outer', clock.now()]);
      clock.setTimeout(() => log.push(['inner0', clock.now()]), 0);
      clock.setTimeout(() => log.push(['inner100', clock.now()]), 100);
      clock.setTimeout(() => log.push(['inner500', clock.now()]), 500);
    }, 100);
    clock.tick(250);
    expect(log).toEqual([['outer', 100], ['inner0', 100], ['inner100', 200]]);
    expect(clock.now()).toBe(250);
    expect(clock.pending()).toBe(1);
  });

  it('a timer cleared by an earlier callback does not fire', () => {
    const clock = createClock();
    const log = [];
    const later = clock.setTimeout(() => log.push('later'), 20);
    clock.setTimeout(() => { log.push('first'); clock.clearTimeout(later); }, 10);
    clock.tick(100);
    expect(log).toEqual(['first']);
  });

  it('clearTimeout ignores unknown ids and undefined', () => {
    const clock = createClock();
    let fired = 0;
    clock.setTimeout(() => fired++, 5);
    expect(() => { clock.clearTimeout(999); clock.clearTimeout(undefined); clock.clearInterval(undefined); }).not.toThrow();
    clock.tick(5);
    expect(fired).toBe(1);
  });
});

describe('intervals', () => {
  it('fires on schedule without drifting', () => {
    const clock = createClock();
    const at = [];
    clock.setInterval(() => at.push(clock.now()), 100);
    clock.tick(350);
    expect(at).toEqual([100, 200, 300]);
    expect(clock.now()).toBe(350);
    clock.tick(50);
    expect(at).toEqual([100, 200, 300, 400]);
  });

  it('can be cleared from its own callback, and by clearTimeout', () => {
    const clock = createClock();
    let n = 0;
    const id = clock.setInterval(() => { if (++n === 3) clock.clearInterval(id); }, 10);
    clock.tick(1000);
    expect(n).toBe(3);
    expect(clock.pending()).toBe(0);

    let m = 0;
    const id2 = clock.setInterval(() => m++, 10);
    clock.tick(25);
    clock.clearTimeout(id2);
    clock.tick(100);
    expect(m).toBe(2);
  });

  it('an interval below 1 ms counts as 1 ms', () => {
    const clock = createClock();
    let n = 0;
    clock.setInterval(() => n++, 0);
    clock.tick(3);
    expect(n).toBe(3);
  });
});

describe('errors', () => {
  it('a throwing callback stops tick at its due time; the rest stay scheduled', () => {
    const clock = createClock();
    const log = [];
    clock.setTimeout(() => log.push('a'), 10);
    clock.setTimeout(() => { throw new Error('boom'); }, 20);
    clock.setTimeout(() => log.push('c'), 30);
    const e = thrown(() => clock.tick(100));
    expect(e.message).toBe('boom');
    expect(log).toEqual(['a']);
    expect(clock.now()).toBe(20);
    expect(clock.pending()).toBe(1);
    clock.tick(80);
    expect(log).toEqual(['a', 'c']);
    expect(clock.now()).toBe(100);
  });
});

describe('tickAsync', () => {
  // Code under test: retry with exponential backoff, sleeping on the fake clock.
  async function retry(clock, op) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await op();
      } catch (e) {
        if (attempt === 3) throw e;
        await new Promise((resolve) => clock.setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
  }

  it('lets awaiting code continue between timers', async () => {
    const clock = createClock();
    const calls = [];
    const done = retry(clock, async () => {
      calls.push(clock.now());
      if (calls.length < 4) throw new Error('flaky');
      return 'ok';
    });
    await clock.tickAsync(1000);
    expect(calls).toEqual([0, 100, 300, 700]);
    expect(await done).toBe('ok');
    expect(clock.now()).toBe(1000);
  });

  it('is what the synchronous tick is missing', () => {
    const clock = createClock();
    const calls = [];
    retry(clock, async () => { calls.push(clock.now()); throw new Error('flaky'); }).catch(() => {});
    clock.tick(1000);
    // The continuation after the first sleep had no chance to run.
    expect(calls).toEqual([0]);
  });

  it('continuations see the due time, not the end of the window', async () => {
    const clock = createClock();
    const seen = [];
    (async () => {
      await new Promise((r) => clock.setTimeout(r, 40));
      seen.push(clock.now());
      await new Promise((r) => clock.setTimeout(r, 40));
      seen.push(clock.now());
    })();
    await clock.tickAsync(500);
    expect(seen).toEqual([40, 80]);
  });

  it('runs pending promise callbacks before the first timer and after the last', async () => {
    const clock = createClock();
    const log = [];
    Promise.resolve().then(() => clock.setTimeout(() => log.push('scheduled from a microtask'), 10));
    await clock.tickAsync(20);
    expect(log).toEqual(['scheduled from a microtask']);

    const clock2 = createClock();
    let after = false;
    clock2.setTimeout(() => { Promise.resolve().then(() => { after = true; }); }, 5);
    await clock2.tickAsync(5);
    expect(after).toBe(true);
  });

  it('returns the number of callbacks run', async () => {
    const clock = createClock();
    clock.setTimeout(() => {}, 1);
    clock.setInterval(() => {}, 10);
    expect(await clock.tickAsync(30)).toBe(4);
  });
});

describe('runAll', () => {
  it('runs chained timers, jumping to each due time', () => {
    const clock = createClock();
    const log = [];
    clock.setTimeout(() => {
      log.push(clock.now());
      clock.setTimeout(() => {
        log.push(clock.now());
        clock.setTimeout(() => log.push(clock.now()), 5000);
      }, 1000);
    }, 1000);
    expect(clock.runAll()).toBe(3);
    expect(log).toEqual([1000, 2000, 7000]);
    expect(clock.now()).toBe(7000);
    expect(clock.pending()).toBe(0);
  });

  it('allows exactly 1000 callbacks', () => {
    const clock = createClock();
    let n = 0;
    const step = () => { if (++n < 1000) clock.setTimeout(step, 1); };
    clock.setTimeout(step, 1);
    expect(clock.runAll()).toBe(1000);
  });

  it('throws instead of hanging on an interval', () => {
    const clock = createClock();
    let n = 0;
    clock.setInterval(() => n++, 10);
    const e = thrown(() => clock.runAll());
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain('infinite loop');
    expect(n).toBe(1000);
  });
});
