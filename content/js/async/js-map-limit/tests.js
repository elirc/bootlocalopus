const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('mapLimit', () => {
  it('returns results in input order', async () => {
    const out = await solution.mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      await sleep(n === 1 ? 30 : 2);
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
  });

  it('passes the index as the second argument', async () => {
    const out = await solution.mapLimit(['a', 'b', 'c'], 2, async (v, i) => v + i);
    expect(out).toEqual(['a0', 'b1', 'c2']);
  });

  it('handles an empty list', async () => {
    expect(await solution.mapLimit([], 3, async () => 1)).toEqual([]);
  });

  it('never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    await solution.mapLimit(Array.from({ length: 20 }, (_, i) => i), 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await sleep(5);
      inFlight--;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBe(3);
  });

  it('keeps the pool busy instead of batching', async () => {
    // Item 0 hangs until the test releases it. A pool keeps its other slot
    // busy and works through items 1..7 meanwhile. Fixed batches of 2 cannot
    // start item 2 until item 0 is done, so they stall at [0, 1].
    // Structural, not wall-clock: it holds on a loaded machine.
    let release;
    const gate = new Promise((r) => { release = r; });
    const started = [];
    const run = solution.mapLimit([0, 1, 2, 3, 4, 5, 6, 7], 2, async (n) => {
      started.push(n);
      if (n === 0) await gate;
      else await sleep(1);
      return n * 10;
    });
    try {
      const deadline = Date.now() + 1000;
      while (started.length < 8 && Date.now() < deadline) await sleep(5);
      expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    } finally {
      release();
    }
    expect(await run).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
  });

  it('does not hold later items behind a slow one in the middle', async () => {
    // Limit 3, item 1 is slow. Items 3.. must start before item 1 finishes.
    let release;
    const gate = new Promise((r) => { release = r; });
    const startedBeforeRelease = [];
    let released = false;
    const run = solution.mapLimit([0, 1, 2, 3, 4, 5], 3, async (n) => {
      if (!released) startedBeforeRelease.push(n);
      if (n === 1) await gate;
      else await sleep(1);
      return n;
    });
    try {
      const deadline = Date.now() + 1000;
      while (startedBeforeRelease.length < 6 && Date.now() < deadline) await sleep(5);
      expect(startedBeforeRelease).toEqual([0, 1, 2, 3, 4, 5]);
    } finally {
      released = true;
      release();
    }
    expect(await run).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('runs with a limit larger than the list', async () => {
    const out = await solution.mapLimit([1, 2], 99, async (n) => n);
    expect(out).toEqual([1, 2]);
  });

  it('rejects when a task rejects', async () => {
    await expect(
      solution.mapLimit([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('item 2 failed');
        return n;
      }),
    ).rejects.toThrow('item 2 failed');
  });
});