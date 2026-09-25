import { Readable, Writable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';

const within = (promise, ms, message) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
};
const tick = () => new Promise((r) => setImmediate(r));

/** gzip `text` and serve it in `size`-byte chunks. */
const gzInput = (text, size = 64) => {
  const gz = gzipSync(Buffer.from(text));
  const log = { pulled: 0, total: Math.ceil(gz.length / size) };
  const stream = Readable.from((function* () {
    for (let i = 0; i < gz.length; i += size) {
      log.pulled++;
      yield gz.subarray(i, i + size);
    }
  })(), { objectMode: false, highWaterMark: size });
  return { stream, log };
};

/** A slowish Writable with a tiny buffer that records what was written. */
const rejectsSink = () => {
  const sink = { text: '', ended: false, maxQueued: 0 };
  sink.stream = new Writable({
    highWaterMark: 8,
    write(chunk, _e, cb) { sink.text += chunk.toString(); setImmediate(cb); },
    final(cb) { sink.ended = true; cb(); },
  });
  const write = sink.stream.write.bind(sink.stream);
  sink.stream.write = (...args) => {
    const ok = write(...args);
    sink.maxQueued = Math.max(sink.maxQueued, sink.stream.writableLength);
    return ok;
  };
  return sink;
};

const fakeDb = ({ failOn = -1, onInsert } = {}) => {
  const db = { batches: [], inFlight: 0, maxInFlight: 0 };
  db.insert = async (batch) => {
    db.inFlight++;
    db.maxInFlight = Math.max(db.maxInFlight, db.inFlight);
    db.batches.push(batch);
    const n = db.batches.length;
    if (onInsert) onInsert(n);
    await tick();
    db.inFlight--;
    if (n - 1 === failOn) throw new Error('insert failed: connection reset');
  };
  return db;
};

const ev = (id, extra = {}) => JSON.stringify({ id, type: 'click', ts: 1700000000000, ...extra });
/** 5000 events with random payloads: barely compressible, so the gzip input has many chunks. */
const bulk = () => Array.from({ length: 5000 }, (_, i) => ev(`e${i}`, { r: randomBytes(24).toString('hex') })).join('\n');

const run = (text, { chunk = 64, batchSize, db = fakeDb(), signal } = {}) => {
  const input = gzInput(text, chunk);
  const rejects = rejectsSink();
  const promise = solution.importEvents({ input: input.stream, insert: db.insert, rejects: rejects.stream, batchSize, signal });
  return { promise, input, rejects, db };
};

const rejection = async (promise) => {
  try {
    await within(promise, 5000, 'HUNG: importEvents never settled');
  } catch (e) {
    if (String(e.message).startsWith('HUNG')) throw e;
    return e;
  }
  return null;
};

describe('importEvents: the happy path', () => {
  it('inserts valid events in batches, in order, as parsed objects', async () => {
    const lines = Array.from({ length: 7 }, (_, i) => ev(`e${i + 1}`, { n: i }));
    const { promise, db, rejects } = run(lines.join('\n') + '\n', { batchSize: 3 });
    expect(await within(promise, 5000, 'never resolved')).toEqual({ lines: 7, inserted: 7, rejected: 0, duplicates: 0 });
    expect(db.batches.map((b) => b.map((e) => e.id))).toEqual([['e1', 'e2', 'e3'], ['e4', 'e5', 'e6'], ['e7']]);
    expect(db.batches[0][1]).toEqual({ id: 'e2', type: 'click', ts: 1700000000000, n: 1 });
    expect(db.maxInFlight).toBe(1);
    expect(rejects.text).toBe('');
    expect(rejects.ended).toBe(false);
  });

  it('uses a default batch size of 100', async () => {
    const lines = Array.from({ length: 250 }, (_, i) => ev(`e${i}`));
    const { promise, db } = run(lines.join('\n'));
    await within(promise, 5000, 'never resolved');
    expect(db.batches.map((b) => b.length)).toEqual([100, 100, 50]);
  });

  it('counts lines exactly: empty lines count, a trailing newline does not add one', async () => {
    const a = run(`${ev('a')}\n\n${ev('b')}\r\n\r\n${ev('c')}`);
    expect(await within(a.promise, 5000, 'never resolved')).toEqual({ lines: 5, inserted: 3, rejected: 0, duplicates: 0 });
    const b = run(`${ev('a')}\n${ev('b')}\n`);
    expect((await within(b.promise, 5000, 'never resolved')).lines).toBe(2);
    const c = run('');
    expect(await within(c.promise, 5000, 'never resolved')).toEqual({ lines: 0, inserted: 0, rejected: 0, duplicates: 0 });
    expect(c.db.batches).toEqual([]);
  });

  it('survives multi-byte characters split across tiny chunks', async () => {
    const lines = ['Zoë', 'Łódź', '東京', '☕☕'].map((name, i) => ev(`u${i}`, { name }));
    const { promise, db } = run(lines.join('\r\n') + '\r\n', { chunk: 1, batchSize: 10 });
    await within(promise, 5000, 'never resolved');
    expect(db.batches[0].map((e) => e.name)).toEqual(['Zoë', 'Łódź', '東京', '☕☕']);
  });
});

describe('importEvents: bad data', () => {
  it('writes rejects with line numbers and reasons, and carries on', async () => {
    const text = [
      ev('ok1'),
      '{"id": "x", "type": "click", "ts": 1', // truncated JSON
      '',
      '[1,2,3]',
      'null',
      JSON.stringify({ id: 'y', type: 'click', ts: '1700000000000' }),
      JSON.stringify({ id: '', type: 'click', ts: 1 }),
      JSON.stringify({ id: 'z', type: 'click', ts: 1.5 }),
      JSON.stringify({ id: 'w', ts: 1 }),
      ev('ok2') + '\r',
    ].join('\n');
    const { promise, db, rejects } = run(text, { batchSize: 10 });
    expect(await within(promise, 5000, 'never resolved')).toEqual({ lines: 10, inserted: 2, rejected: 7, duplicates: 0 });
    expect(db.batches.map((b) => b.map((e) => e.id))).toEqual([['ok1', 'ok2']]);
    expect(rejects.text).toBe(
      '2\tinvalid json\t{"id": "x", "type": "click", "ts": 1\n' +
      '4\tinvalid event\t[1,2,3]\n' +
      '5\tinvalid event\tnull\n' +
      '6\tinvalid event\t{"id":"y","type":"click","ts":"1700000000000"}\n' +
      '7\tinvalid event\t{"id":"","type":"click","ts":1}\n' +
      '8\tinvalid event\t{"id":"z","type":"click","ts":1.5}\n' +
      '9\tinvalid event\t{"id":"w","ts":1}\n',
    );
    expect(rejects.ended).toBe(false);
  });

  it('respects backpressure on the rejects stream', async () => {
    const text = Array.from({ length: 300 }, (_, i) => `garbage line ${i}`).join('\n');
    const { promise, rejects } = run(text);
    const stats = await within(promise, 8000, 'never resolved');
    expect(stats.rejected).toBe(300);
    await new Promise((r) => setTimeout(r, 50));
    expect(rejects.text.split('\n').filter(Boolean)).toHaveLength(300);
    // one reject line is ~35 bytes; waiting for 'drain' keeps the queue to about one line
    expect(rejects.maxQueued).toBeLessThan(200);
  });

  it('skips and counts duplicate ids, keeping the first', async () => {
    const text = [ev('a', { v: 1 }), ev('b'), ev('a', { v: 2 }), ev('c'), ev('b'), ev('a', { v: 3 })].join('\n');
    const { promise, db } = run(text, { batchSize: 2 });
    expect(await within(promise, 5000, 'never resolved')).toEqual({ lines: 6, inserted: 3, rejected: 0, duplicates: 3 });
    expect(db.batches.flat().map((e) => [e.id, e.v])).toEqual([['a', 1], ['b', undefined], ['c', undefined]]);
  });
});

describe('importEvents: failures stop everything', () => {
  it('rejects with the insert error and inserts nothing more', async () => {
    const lines = bulk();
    const db = fakeDb({ failOn: 1 });
    const { promise, input } = run(lines, { batchSize: 10, db, chunk: 256 });
    const e = await rejection(promise);
    expect(e && e.message).toBe('insert failed: connection reset');
    await tick();
    expect(db.batches).toHaveLength(2);
    expect(input.stream.destroyed).toBe(true);
    expect(input.log.pulled).toBeLessThan(input.log.total);
  });

  it('rejects with zlib\'s error on a corrupt file, inserting nothing', async () => {
    const db = fakeDb();
    const rejects = rejectsSink();
    const input = Readable.from([Buffer.from('this is not gzip')]);
    const e = await rejection(solution.importEvents({ input, insert: db.insert, rejects: rejects.stream }));
    expect(e === null).toBe(false);
    expect(String(e.code)).toMatch(/^Z_/);
    expect(db.batches).toEqual([]);
  });

  it('rejects on a truncated file', async () => {
    const gz = gzipSync(Array.from({ length: 50 }, (_, i) => ev(`e${i}`)).join('\n'));
    const db = fakeDb();
    const rejects = rejectsSink();
    const input = Readable.from([gz.subarray(0, gz.length - 12)]);
    const e = await rejection(solution.importEvents({ input, insert: db.insert, rejects: rejects.stream, batchSize: 1000 }));
    expect(e === null).toBe(false);
    expect(String(e.code)).toMatch(/^Z_/);
    expect(db.batches).toEqual([]); // the partial last batch is not inserted
  });

  it('stops on abort, even when it happens during an insert', async () => {
    const lines = bulk();
    const ac = new AbortController();
    const db = fakeDb({ onInsert: (n) => { if (n === 2) ac.abort(); } });
    const { promise, input } = run(lines, { batchSize: 10, db, signal: ac.signal, chunk: 256 });
    const e = await rejection(promise);
    expect(e && e.name).toBe('AbortError');
    await tick();
    expect(db.batches).toHaveLength(2);
    expect(input.stream.destroyed).toBe(true);
    expect(input.log.pulled).toBeLessThan(input.log.total);
  });

  it('rejects at once for an already-aborted signal', async () => {
    const db = fakeDb();
    const { promise } = run(ev('a'), { db, signal: AbortSignal.abort() });
    const e = await rejection(promise);
    expect(e && e.name).toBe('AbortError');
    expect(db.batches).toEqual([]);
  });
});
