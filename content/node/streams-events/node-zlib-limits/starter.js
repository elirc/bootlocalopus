import { createReadStream, createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';

export async function gzipFile(src, dest) {
  // TODO: stream src through gzip into dest; leave no dest behind on failure.
  throw new Error('gzipFile is not implemented yet');
}

export class TooLargeError extends Error {
  constructor(limit) {
    super(`decompressed data exceeds ${limit} bytes`);
    this.name = 'TooLargeError';
    this.limit = limit;
  }
}

export async function gunzipLimited(input, maxBytes) {
  // TODO: decompress, counting output bytes; stop as soon as maxBytes is exceeded.
  throw new Error('gunzipLimited is not implemented yet');
}
