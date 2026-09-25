import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip } from 'node:zlib';

export async function importEvents({ input, insert, rejects, batchSize = 100, signal }) {
  // TODO: gunzip -> lines -> validate -> dedupe -> batches of inserts,
  // with rejects written out and every failure stopping the whole pipeline.
  throw new Error('importEvents is not implemented yet');
}
