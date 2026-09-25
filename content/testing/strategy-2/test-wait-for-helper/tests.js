/** A fake clock: sleep advances it instantly and records every pause. */
function fakeTime(start = 1_000_000) {
  let t = start;
  const slept = [];
  return {
    now: () => t,
    sleep: async (ms) => { slept.push(ms); t += ms; },
    slept,
    elapsed: () => t - start,
  };
}

/** A check that throws `failures` times (with numbered messages), then returns `value`. */
function eventually(failures, value = 'ready') {
  const calls = [];
  const check = () => {
    calls.push(calls.length + 1);
    if (calls.length <= failures) throw new Error(`not yet (check ${calls.length})`);
    return value;
  };
  return { check, calls };
}

describe('waitFor', () => {
  it('checks straight away and does not sleep when the check already passes', async () => {
    const time = fakeTime();
    const { check, calls } = eventually(0);
    await expect(solution.waitFor(check, { now: time.now, sleep: time.sleep })).resolves.toBe('ready');
    expect(calls).toEqual([1]);
    expect(time.slept).toEqual([]);
  });

  it('polls every intervalMs until the check stops throwing', async () => {
    const time = fakeTime();
    const { check, calls } = eventually(3);
    const value = await solution.waitFor(check, { timeoutMs: 1000, intervalMs: 50, now: time.now, sleep: time.sleep });
    expect(value).toBe('ready');
    expect(calls).toEqual([1, 2, 3, 4]);
    expect(time.slept).toEqual([50, 50, 50]);
  });

  it('awaits an async check, and treats a rejection as "not yet"', async () => {
    const time = fakeTime();
    let n = 0;
    const check = async () => {
      n++;
      await Promise.resolve();
      if (n < 3) throw new Error('still loading');
      return { rows: 2 };
    };
    await expect(solution.waitFor(check, { now: time.now, sleep: time.sleep })).resolves.toEqual({ rows: 2 });
    expect(n).toBe(3);
  });

  it('passes as soon as the check does not throw, even if it returns false', async () => {
    const time = fakeTime();
    const { check, calls } = eventually(0, false);
    await expect(solution.waitFor(check, { now: time.now, sleep: time.sleep })).resolves.toBe(false);
    expect(calls).toEqual([1]);
  });

  it('gives up at the deadline, after one last check at the deadline', async () => {
    const time = fakeTime();
    const { check, calls } = eventually(Infinity);
    const run = solution.waitFor(check, { timeoutMs: 200, intervalMs: 50, now: time.now, sleep: time.sleep });
    await expect(run).rejects.toThrow('waitFor timed out after 200ms');
    expect(calls).toEqual([1, 2, 3, 4, 5]); // at 0, 50, 100, 150 and 200
    expect(time.slept).toEqual([50, 50, 50, 50]);
  });

  it('shortens the last sleep so it never waits past the deadline', async () => {
    const time = fakeTime();
    const { check, calls } = eventually(Infinity);
    await solution.waitFor(check, { timeoutMs: 120, intervalMs: 50, now: time.now, sleep: time.sleep }).catch(() => {});
    expect(time.slept).toEqual([50, 50, 20]);
    expect(time.elapsed()).toBe(120);
    expect(calls).toHaveLength(4);
  });

  it('passes when the condition comes true exactly at the deadline', async () => {
    const time = fakeTime();
    const { check } = eventually(4); // fails at 0, 50, 100, 150; passes at 200
    await expect(solution.waitFor(check, { timeoutMs: 200, intervalMs: 50, now: time.now, sleep: time.sleep })).resolves.toBe('ready');
  });

  it('reports the last failure in the message and as the cause', async () => {
    const time = fakeTime();
    const { check } = eventually(Infinity);
    let caught;
    try {
      await solution.waitFor(check, { timeoutMs: 100, intervalMs: 50, now: time.now, sleep: time.sleep });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe('waitFor timed out after 100ms: not yet (check 3)');
    expect(caught.cause).toBeInstanceOf(Error);
    expect(caught.cause.message).toBe('not yet (check 3)');
  });

  it('with timeoutMs 0, checks exactly once and never sleeps', async () => {
    const time = fakeTime();
    const failing = eventually(Infinity);
    await expect(solution.waitFor(failing.check, { timeoutMs: 0, now: time.now, sleep: time.sleep })).rejects.toThrow('not yet (check 1)');
    expect(failing.calls).toEqual([1]);
    expect(time.slept).toEqual([]);
  });

  it('works with the real clock and timers by default', async () => {
    let ready = false;
    setTimeout(() => { ready = true; }, 30);
    const value = await solution.waitFor(() => {
      if (!ready) throw new Error('not ready');
      return 'done';
    }, { timeoutMs: 3000, intervalMs: 5 });
    expect(value).toBe('done');
  });
});
