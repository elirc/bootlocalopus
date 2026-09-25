const { processInChunks } = solution;

const range = (n) => Array.from({ length: n }, (_, i) => i);

async function rejection(promise) {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected the promise to reject');
}

// Stands in for "everything else the server has to do": a callback that
// re-queues itself as a macrotask and records how far the work had got.
function startTicker(read) {
  const seen = [];
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    seen.push(read());
    setImmediate(tick);
  };
  setImmediate(tick);
  return { seen, stop: () => { stopped = true; } };
}

describe('results', () => {
  it('maps every item in order, passing the index', async () => {
    const out = await processInChunks(['a', 'b', 'c', 'd', 'e'], (x, i) => `${i}:${x}`, { chunkSize: 2 });
    expect(out).toEqual(['0:a', '1:b', '2:c', '3:d', '4:e']);
  });

  it('an empty list resolves to [] without calling anything', async () => {
    let calls = 0;
    const out = await processInChunks([], () => calls++, { onProgress: () => calls++ });
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it('reports progress after each chunk, defaulting to 100 per chunk', async () => {
    const progress = [];
    await processInChunks(range(250), (x) => x, { onProgress: (done, total) => progress.push([done, total]) });
    expect(progress).toEqual([[100, 250], [200, 250], [250, 250]]);
  });
});

describe('yielding to the event loop', () => {
  it('lets other macrotasks run between chunks', async () => {
    let processed = 0;
    const ticker = startTicker(() => processed);
    try {
      await processInChunks(range(10), () => { processed++; }, { chunkSize: 3 });
    } finally {
      ticker.stop();
    }
    // Every chunk boundary was visible to the rest of the program.
    for (const boundary of [3, 6, 9]) expect(ticker.seen).toContain(boundary);
    // And nothing ever saw a chunk half done.
    for (const n of ticker.seen) expect(n === 10 || n % 3 === 0).toBe(true);
  });

  it('a macrotask queued before the work runs before the work finishes', async () => {
    let processed = 0;
    let seenByOtherWork = null;
    setImmediate(() => { seenByOtherWork = processed; });
    await processInChunks(range(1000), () => { processed++; }, { chunkSize: 100 });
    expect(seenByOtherWork).not.toBeNull();
    expect(seenByOtherWork).toBeLessThan(1000);
  });

  it('does not yield inside a chunk', async () => {
    let processed = 0;
    const ticker = startTicker(() => processed);
    try {
      await processInChunks(range(40), () => { processed++; }, { chunkSize: 20 });
    } finally {
      ticker.stop();
    }
    for (const n of ticker.seen) expect([0, 20, 40]).toContain(n);
  });
});

describe('abort', () => {
  it('rejects with the reason, without calling fn, when already aborted', async () => {
    const controller = new AbortController();
    const reason = new Error('client went away');
    controller.abort(reason);
    let calls = 0;
    const e = await rejection(processInChunks(range(5), () => calls++, { signal: controller.signal }));
    expect(e).toBe(reason);
    expect(calls).toBe(0);
    expect(await rejection(processInChunks([], () => {}, { signal: controller.signal }))).toBe(reason);
  });

  it('stops before the next chunk once aborted', async () => {
    const controller = new AbortController();
    let calls = 0;
    const e = await rejection(processInChunks(range(10), () => calls++, {
      chunkSize: 3,
      signal: controller.signal,
      onProgress: (done) => { if (done === 3) controller.abort(); },
    }));
    expect(e).toBe(controller.signal.reason);
    expect(e.name).toBe('AbortError');
    expect(calls).toBe(3);
  });

  it('an abort from another macrotask is noticed at the next chunk', async () => {
    const controller = new AbortController();
    let calls = 0;
    setImmediate(() => controller.abort(new Error('deploy started')));
    const e = await rejection(processInChunks(range(10000), () => calls++, { chunkSize: 10, signal: controller.signal }));
    expect(e.message).toBe('deploy started');
    expect(calls % 10).toBe(0);
    expect(calls).toBeLessThan(10000);
  });
});

describe('errors', () => {
  it('rejects with the error fn threw and processes nothing after it', async () => {
    const boom = new Error('bad record');
    const seen = [];
    const e = await rejection(processInChunks(range(10), (x) => {
      seen.push(x);
      if (x === 4) throw boom;
    }, { chunkSize: 3 }));
    expect(e).toBe(boom);
    expect(seen).toEqual([0, 1, 2, 3, 4]);
  });
});
