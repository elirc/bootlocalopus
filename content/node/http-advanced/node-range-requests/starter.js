import { createHash } from 'node:crypto';

export function parseRange(header, size) {
  // TODO: null | 'unsatisfiable' | { start, end } (inclusive)
  throw new Error('parseRange is not implemented yet');
}

export function createFileHandler(files) {
  return (req, res) => {
    // TODO: 200 / 206 / 416 with Accept-Ranges, ETag and If-Range.
    res.writeHead(501, { 'content-type': 'text/plain' });
    res.end('not implemented');
  };
}
