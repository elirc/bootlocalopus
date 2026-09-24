describe('retry', () => {
  const noSleep = () => Promise.resolve();

  it('returns the first success without retrying', async () => {
    let calls = 0;
    const out = await solution.retry(async () => { calls++; return 'ok'; }, { sleep: noSleep });
    expect(out).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries until it succeeds', async () => {
    let calls = 0;
    const out = await solution.retry(async () => {
      calls++;
      if (calls < 3) throw new Error('flaky');
      return 'third time lucky';
    }, { attempts: 5, sleep: noSleep });
    expect(out).toBe('third time lucky');
    expect(calls).toBe(3);
  });

  it('passes the attempt number, starting at 1', async () => {
    const seen = [];
    await solution.retry(async (attempt) => {
      seen.push(attempt);
      if (attempt < 3) throw new Error('again');
      return attempt;
    }, { attempts: 3, sleep: noSleep });
    expect(seen).toEqual([1, 2, 3]);
  });

  it('gives up after the attempt budget, reporting the last error', async () => {
    let calls = 0;
    await expect(
      solution.retry(async () => { calls++; throw new Error('failure ' + calls); },
        { attempts: 4, sleep: noSleep }),
    ).rejects.toThrow('failure 4');
    expect(calls).toBe(4);
  });

  it('backs off exponentially', async () => {
    const delays = [];
    await expect(
      solution.retry(async () => { throw new Error('x'); }, {
        attempts: 4,
        baseDelay: 100,
        factor: 3,
        sleep: (ms) => { delays.push(ms); return Promise.resolve(); },
      }),
    ).rejects.toThrow('x');
    expect(delays).toEqual([100, 300, 900]);
  });

  it('does not sleep after the final failure', async () => {
    const delays = [];
    await expect(
      solution.retry(async () => { throw new Error('x'); },
        { attempts: 2, baseDelay: 5, sleep: (ms) => { delays.push(ms); return Promise.resolve(); } }),
    ).rejects.toThrow();
    expect(delays).toHaveLength(1);
  });

  it('stops immediately when shouldRetry says no', async () => {
    let calls = 0;
    const delays = [];
    await expect(
      solution.retry(async () => {
        calls++;
        const err = new Error('bad request');
        err.status = 400;
        throw err;
      }, {
        attempts: 5,
        shouldRetry: (err) => err.status >= 500,
        sleep: (ms) => { delays.push(ms); return Promise.resolve(); },
      }),
    ).rejects.toThrow('bad request');
    expect(calls).toBe(1);
    expect(delays).toEqual([]);
  });

  it('does not call fn when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('too late'));
    let calls = 0;
    await expect(
      solution.retry(async () => { calls++; return 'nope'; }, { signal: controller.signal, sleep: noSleep }),
    ).rejects.toThrow('too late');
    expect(calls).toBe(0);
  });

  it('stops retrying once the signal aborts mid-wait, rejecting with its reason', async () => {
    const controller = new AbortController();
    let calls = 0;
    await expect(
      solution.retry(async () => { calls++; throw new Error('flaky'); }, {
        attempts: 10,
        signal: controller.signal,
        sleep: async () => { controller.abort(new Error('user navigated away')); },
      }),
    ).rejects.toThrow('user navigated away');
    expect(calls).toBe(1);
  });

  it('passes the signal to sleep', async () => {
    const controller = new AbortController();
    const seen = [];
    await expect(
      solution.retry(async () => { throw new Error('x'); }, {
        attempts: 2,
        signal: controller.signal,
        sleep: async (ms, signal) => { seen.push(signal); },
      }),
    ).rejects.toThrow('x');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(controller.signal);
  });

  it('the built-in sleep ends as soon as the signal aborts', async () => {
    // A 5 s backoff, aborted after ~20 ms. Structural: whichever settles
    // first, the retry or a 2 s marker, decides — no tight timing.
    const controller = new AbortController();
    let calls = 0;
    const run = solution.retry(async () => { calls++; throw new Error('flaky'); }, {
      attempts: 3,
      baseDelay: 5000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(new Error('cancelled by user')), 20);
    let marker;
    const winner = await Promise.race([
      run.then(() => 'resolved', (err) => err),
      new Promise((r) => { marker = setTimeout(() => r('still waiting'), 2000); }),
    ]);
    clearTimeout(marker);
    expect(winner).toBeInstanceOf(Error);
    expect(winner.message).toBe('cancelled by user');
    expect(calls).toBe(1);
  });

  it('applies jitter to every computed delay', async () => {
    const delays = [];
    await expect(
      solution.retry(async () => { throw new Error('x'); }, {
        attempts: 3,
        baseDelay: 100,
        jitter: (ms) => ms / 2,
        sleep: (ms) => { delays.push(ms); return Promise.resolve(); },
      }),
    ).rejects.toThrow('x');
    expect(delays).toEqual([50, 100]);
  });
});