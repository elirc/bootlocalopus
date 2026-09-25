import { createHash } from 'node:crypto';

export function parseRange(header, size) {
  if (typeof header !== 'string' || !header.startsWith('bytes=')) return null;
  const spec = header.slice('bytes='.length);
  const match = /^(\d*)-(\d*)$/.exec(spec); // one range only; a comma fails this
  if (!match || (match[1] === '' && match[2] === '')) return null;

  if (match[1] === '') {
    // suffix: the last N bytes
    const length = Number(match[2]);
    if (length === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(match[1]);
  const last = match[2] === '' ? Infinity : Number(match[2]); // open-ended: to the end
  if (last < start) return null; // syntactically invalid: ignore the header
  if (start >= size) return 'unsatisfiable';
  return { start, end: Math.min(last, size - 1) };
}

const etagOf = (buf) => `"${createHash('sha256').update(buf).digest('hex').slice(0, 32)}"`;

export function createFileHandler(files) {
  return (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const content = files[pathname];
    if (req.method !== 'GET' || !content) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    const etag = etagOf(content);
    const base = { 'accept-ranges': 'bytes', etag };

    // A resumed download of a file that has changed must start over.
    const ifRange = req.headers['if-range'];
    const range = ifRange !== undefined && ifRange !== etag ? null : parseRange(req.headers.range, content.length);

    if (range === 'unsatisfiable') {
      res.writeHead(416, { ...base, 'content-range': `bytes */${content.length}` });
      res.end();
      return;
    }
    if (range === null) {
      res.writeHead(200, { ...base, 'content-length': content.length });
      res.end(content);
      return;
    }
    const { start, end } = range;
    res.writeHead(206, {
      ...base,
      'content-range': `bytes ${start}-${end}/${content.length}`,
      'content-length': end - start + 1,
    });
    res.end(content.subarray(start, end + 1));
  };
}
