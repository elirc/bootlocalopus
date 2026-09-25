import { once } from 'node:events';
import { finished } from 'node:stream/promises';

export async function writeAll(writable, source) {
  // TODO: write every chunk, wait for 'drain' when write() returns false,
  // never hang on an error, then end() and wait for 'finish'.
  throw new Error('writeAll is not implemented yet');
}
