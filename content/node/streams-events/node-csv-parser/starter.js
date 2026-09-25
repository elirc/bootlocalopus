import { Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

export class CsvError extends Error {
  constructor(message, row) {
    super(`row ${row}: ${message}`);
    this.name = 'CsvError';
    this.row = row;
  }
}

export function createCsvParser({ header = true } = {}) {
  return new Transform({
    readableObjectMode: true,
    transform(chunk, _encoding, callback) {
      // TODO: a character-by-character state machine that survives chunk
      // boundaries: quoted fields, "" escapes, \r\n, blank lines, the header.
      callback(new Error('createCsvParser is not implemented yet'));
    },
  });
}
