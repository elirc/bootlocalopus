import { createReadStream, createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';

export async function gzipFile(src, dest) {
  try {
    await pipeline(createReadStream(src), createGzip(), createWriteStream(dest));
  } catch (error) {
    // createWriteStream already created (or truncated) dest: do not leave it behind.
    await rm(dest, { force: true });
    throw error;
  }
}

export class TooLargeError extends Error {
  constructor(limit) {
    super(`decompressed data exceeds ${limit} bytes`);
    this.name = 'TooLargeError';
    this.limit = limit;
  }
}

export async function gunzipLimited(input, maxBytes) {
  const chunks = [];
  let total = 0;
  await pipeline(input, createGunzip(), async function* (inflated) {
    for await (const chunk of inflated) {
      total += chunk.length;
      // Throwing here destroys every stage: gunzip stops, input stops being read.
      if (total > maxBytes) throw new TooLargeError(maxBytes);
      chunks.push(chunk);
    }
  });
  return Buffer.concat(chunks, total);
}
