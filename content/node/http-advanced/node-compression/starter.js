import { promisify } from 'node:util';
import { gzip, brotliCompress } from 'node:zlib';

export function pickEncoding(header) {
  // TODO: 'br' | 'gzip' | 'identity' from Accept-Encoding, honouring q and *.
  throw new Error('pickEncoding is not implemented yet');
}

export async function sendCompressed(req, res, { status = 200, type, body }) {
  // TODO: merge Vary, decide whether to compress, set the right headers.
  res.writeHead(501, { 'content-type': 'text/plain' });
  res.end('not implemented');
}
