const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('loadSequential', () => {
  it('preserves order', async () => {
    const out = await solution.loadSequential([1, 2, 3], async (n) => n * 10);
    expect(out).toEqual([10, 20, 30]);
  });
  it('really is one at a time', async () => {
    let inFlight = 0;
    let peak = 0;
    await solution.loadSequential([1, 2, 3, 4], async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await sleep(5);
      inFlight--;
      return n;
    });
    expect(peak).toBe(1);
  });
});

describe('loadParallel', () => {
  it('preserves input order regardless of completion order', async () => {
    const out = await solution.loadParallel([1, 2, 3], async (n) => {
      await sleep(n === 1 ? 30 : 1);
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30]);
  });
  it('overlaps the work', async () => {
    let inFlight = 0;
    let peak = 0;
    await solution.loadParallel([1, 2, 3, 4, 5], async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await sleep(25);
      inFlight--;
      return n;
    });
    // All five in flight at once is the proof of overlap; no wall-clock check.
    expect(peak).toBe(5);
  });
  it('rejects if any call rejects', async () => {
    await expect(
      solution.loadParallel([1, 2], async (n) => { if (n === 2) throw new Error('boom'); return n; }),
    ).rejects.toThrow('boom');
  });
});

describe('settleAll', () => {
  it('reports successes and failures side by side, in order', async () => {
    const out = await solution.settleAll([1, 2, 3], async (n) => {
      if (n === 2) throw new Error('id 2 is cursed');
      return n * 2;
    });
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ status: 'fulfilled', value: 2 });
    expect(out[1].status).toBe('rejected');
    expect(out[1].reason.message).toBe('id 2 is cursed');
    expect(out[2]).toEqual({ status: 'fulfilled', value: 6 });
  });
  it('never rejects, even if everything fails', async () => {
    const out = await solution.settleAll([1, 2], async () => { throw new Error('all down'); });
    expect(out.every((r) => r.status === 'rejected')).toBe(true);
  });
  it('handles a loader that throws synchronously', async () => {
    const out = await solution.settleAll([1], () => { throw new Error('sync throw'); });
    expect(out[0].status).toBe('rejected');
  });
  it('does not delegate to Promise.allSettled', async () => {
    const original = Promise.allSettled;
    Promise.allSettled = () => { throw new Error('write it yourself'); };
    try {
      const out = await solution.settleAll([1], async (n) => n);
      expect(out[0]).toEqual({ status: 'fulfilled', value: 1 });
    } finally {
      Promise.allSettled = original;
    }
  });
});