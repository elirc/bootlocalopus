import { Transform } from 'node:stream';

export function createNdjsonParser() {
  let buffer = '';
  return new Transform({
    readableObjectMode: true,
    transform(chunk, _encoding, callback) {
      // TODO: decode, append, split on newlines, keep the remainder.
      // (This stub fails the stream so the tests fail fast instead of hanging.)
      callback(new Error('transform is not implemented yet'));
    },
    flush(callback) {
      // TODO: the last line may have no newline
      callback(new Error('flush is not implemented yet'));
    },
  });
}

export async function sumField(source, field) {
  // TODO
  throw new Error('sumField is not implemented yet');
}
