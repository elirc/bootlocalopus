import { Writable } from 'node:stream';

export function createBatchWriter({ size, flush }) {
  let batch = [];

  const send = async () => {
    const full = batch;
    batch = []; // a fresh array: the one we hand over is never touched again
    await flush(full);
  };

  return new Writable({
    objectMode: true,
    write(row, _encoding, callback) {
      batch.push(row);
      if (batch.length < size) {
        callback();
        return;
      }
      // Holding the callback until the flush settles is the backpressure,
      // and it is also what keeps flushes from overlapping.
      send().then(() => callback(), callback);
    },
    final(callback) {
      if (batch.length === 0) {
        callback();
        return;
      }
      send().then(() => callback(), callback);
    },
  });
}
