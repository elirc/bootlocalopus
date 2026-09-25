import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const within = (promise, ms, message) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
};
const tick = () => new Promise((r) => setImmediate(r));

/** A fake database: records batches (by reference), concurrency, and how far the source had been read. */
const fakeDb = ({ failOn = -1, source } = {}) => {
  const db = { batches: [], inFlight: 0, maxInFlight: 0, pulledAtFlush: [] };
  db.flush = async (batch) => {
    db.inFlight++;
    db.maxInFlight = Math.max(db.maxInFlight, db.inFlight);
    db.pulledAtFlush.push(source ? source.pulled : 0);
    db.batches.push(batch);
    const index = db.batches.length - 1;
    await tick();
    await tick();
    db.inFlight--;
    if (index === failOn) throw new Error('duplicate key value violates unique constraint');
  };
  return db;
};

const rowsSource = (n) => {
  const state = { pulled: 0 };
  state.stream = Readable.from((function* () {
    for (let i = 1; i <= n; i++) {
      state.pulled++;
      yield { id: i };
    }
  })());
  return state;
};

const ids = (batch) => batch.map((r) => r.id);

describe('createBatchWriter', () => {
  it('flushes full batches in order, then the remainder', async () => {
    const db = fakeDb();
    const src = rowsSource(7);
    await within(pipeline(src.stream, solution.createBatchWriter({ size: 3, flush: db.flush })), 5000, 'pipeline never finished');
    expect(db.batches.map(ids)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it('never calls flush with an empty batch', async () => {
    const exact = fakeDb();
    await pipeline(rowsSource(6).stream, solution.createBatchWriter({ size: 3, flush: exact.flush }));
    expect(exact.batches.map(ids)).toEqual([[1, 2, 3], [4, 5, 6]]);
    const none = fakeDb();
    await pipeline(rowsSource(0).stream, solution.createBatchWriter({ size: 3, flush: none.flush }));
    expect(none.batches).toEqual([]);
  });

  it('hands every batch over as its own array, never touched again', async () => {
    const db = fakeDb();
    await pipeline(rowsSource(10).stream, solution.createBatchWriter({ size: 4, flush: db.flush }));
    expect(db.batches.map(ids)).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10]]);
    expect(new Set(db.batches).size).toBe(3);
  });

  it('runs one flush at a time', async () => {
    const db = fakeDb();
    await pipeline(rowsSource(100).stream, solution.createBatchWriter({ size: 5, flush: db.flush }));
    expect(db.batches).toHaveLength(20);
    expect(db.maxInFlight).toBe(1);
  });

  it('applies backpressure: the source waits for the database', async () => {
    const src = rowsSource(1000);
    const db = fakeDb({ source: src });
    await pipeline(src.stream, solution.createBatchWriter({ size: 10, flush: db.flush }));
    expect(db.batches).toHaveLength(100);
    // When batch k is flushed, only a bounded number of rows beyond it may have been read.
    db.pulledAtFlush.forEach((pulled, k) => {
      expect({ k, ahead: pulled - (k + 1) * 10 <= 40 }).toEqual({ k, ahead: true });
    });
  });

  it('fails the pipeline with the flush error and sends nothing after it', async () => {
    const db = fakeDb({ failOn: 1 });
    let caught;
    try {
      await within(pipeline(rowsSource(50).stream, solution.createBatchWriter({ size: 5, flush: db.flush })), 5000, 'HUNG: the pipeline never settled');
    } catch (e) {
      caught = e;
    }
    expect(caught && caught.message).toBe('duplicate key value violates unique constraint');
    expect(db.batches).toHaveLength(2);
  });

  it('fails the pipeline when the final partial flush rejects', async () => {
    const db = fakeDb({ failOn: 2 });
    let caught;
    try {
      await within(pipeline(rowsSource(11).stream, solution.createBatchWriter({ size: 5, flush: db.flush })), 5000, 'HUNG: the pipeline never settled');
    } catch (e) {
      caught = e;
    }
    expect(caught && caught.message).toBe('duplicate key value violates unique constraint');
    expect(db.batches.map(ids)[2]).toEqual([11]);
  });
});
