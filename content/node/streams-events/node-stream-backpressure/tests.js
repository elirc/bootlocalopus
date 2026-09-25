import { Writable } from 'node:stream';

/** Fails with a clear message instead of letting a hang run into the test timeout. */
const within = (promise, ms, message) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
};

/**
 * A disk that takes one macrotask per chunk. Records what it received, the
 * most bytes ever queued inside it, and whether final() ran.
 */
const slowSink = ({ highWaterMark = 16, failAt = -1 } = {}) => {
  const state = { received: [], maxQueued: 0, finalRan: false, errors: [] };
  const sink = new Writable({
    highWaterMark,
    write(chunk, _enc, cb) {
      if (state.received.length === failAt) {
        setImmediate(() => cb(new Error('ENOSPC: no space left on device')));
        return;
      }
      state.received.push(chunk.toString());
      setImmediate(cb);
    },
    final(cb) {
      setImmediate(() => { state.finalRan = true; cb(); });
    },
  });
  // The caller owns the stream and listens for its errors.
  sink.on('error', (e) => state.errors.push(e));
  const origWrite = sink.write.bind(sink);
  sink.write = (...args) => {
    const r = origWrite(...args);
    state.maxQueued = Math.max(state.maxQueued, sink.writableLength);
    return r;
  };
  return { sink, state };
};

const chunks = (n, size = 8) => Array.from({ length: n }, (_, i) => String(i).padStart(size, '0'));

async function* tracked(items, log) {
  try {
    for (const item of items) {
      log.pulled++;
      yield item;
    }
  } finally {
    log.closed = true;
  }
}

describe('writeAll', () => {
  it('writes every chunk in order, waits for finish, and returns the count', async () => {
    const { sink, state } = slowSink();
    const data = chunks(50);
    const n = await within(solution.writeAll(sink, data), 5000, 'writeAll did not resolve');
    expect(n).toBe(50);
    expect(state.received).toEqual(data);
    expect(state.finalRan).toBe(true);
    expect(sink.writableFinished).toBe(true);
  });

  it('never lets more than highWaterMark plus one chunk pile up', async () => {
    const { sink, state } = slowSink({ highWaterMark: 16 });
    await within(solution.writeAll(sink, chunks(200)), 10000, 'writeAll did not resolve');
    expect(state.received).toHaveLength(200);
    expect(state.maxQueued).toBeLessThanOrEqual(16 + 8);
  });

  it('stops pulling from an async source while the stream is full', async () => {
    const { sink, state } = slowSink({ highWaterMark: 16 });
    const log = { pulled: 0, closed: false, maxAhead: 0 };
    async function* source() {
      for (let i = 0; i < 100; i++) {
        log.maxAhead = Math.max(log.maxAhead, i - state.received.length);
        yield String(i).padStart(8, '0');
      }
    }
    await within(solution.writeAll(sink, source()), 10000, 'writeAll did not resolve');
    expect(state.received).toHaveLength(100);
    // with a 16-byte buffer the source may only run a bounded number of chunks ahead (Readable.from buffers up to 16)
    expect(log.maxAhead).toBeLessThanOrEqual(24);
  });

  it('accepts Buffers and an empty source', async () => {
    const a = slowSink();
    expect(await solution.writeAll(a.sink, [Buffer.from('héllo'), Buffer.from(' wörld')])).toBe(2);
    expect(a.state.received.join('')).toBe('héllo wörld');
    const b = slowSink();
    expect(await within(solution.writeAll(b.sink, []), 5000, 'empty source did not resolve')).toBe(0);
    expect(b.state.finalRan).toBe(true);
  });

  it('rejects with the stream error instead of waiting for drain forever', async () => {
    const { sink, state } = slowSink({ highWaterMark: 16, failAt: 5 });
    const log = { pulled: 0, closed: false };
    let caught;
    try {
      await within(solution.writeAll(sink, tracked(chunks(1000), log)), 5000, 'HUNG: writeAll never settled after the stream failed');
    } catch (e) {
      caught = e;
    }
    expect(caught && caught.message).toBe('ENOSPC: no space left on device');
    expect(state.received).toHaveLength(5);
    expect(log.pulled).toBeLessThan(50); // it stopped reading the source
    expect(log.closed).toBe(true); // and closed it
  });

  it('destroys the stream with the source\'s error and rejects with it', async () => {
    const { sink, state } = slowSink();
    async function* source() {
      yield 'header\n';
      yield 'row 1\n';
      throw new Error('database connection lost');
    }
    let caught;
    try {
      await within(solution.writeAll(sink, source()), 5000, 'writeAll did not settle');
    } catch (e) {
      caught = e;
    }
    expect(caught && caught.message).toBe('database connection lost');
    expect(sink.destroyed).toBe(true);
    expect(state.finalRan).toBe(false); // never ended as if complete
    await new Promise((r) => setImmediate(r));
    expect(state.errors.map((e) => e.message)).toEqual(['database connection lost']);
  });
});
