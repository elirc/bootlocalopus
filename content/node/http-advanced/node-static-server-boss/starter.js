import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

export function createStaticHandler({ root }) {
  return async (req, res) => {
    // TODO: safe path resolution, validators and 304, ranges, gzip, HEAD.
    res.writeHead(501, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not implemented');
  };
}
