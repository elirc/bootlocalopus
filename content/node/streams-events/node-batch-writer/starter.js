import { Writable } from 'node:stream';

export function createBatchWriter({ size, flush }) {
  return new Writable({
    objectMode: true,
    write(row, _encoding, callback) {
      // TODO: collect rows; every `size` rows, await flush(batch) before calling back.
      callback(new Error('createBatchWriter is not implemented yet'));
    },
    // TODO: final(callback) flushes what is left.
  });
}
