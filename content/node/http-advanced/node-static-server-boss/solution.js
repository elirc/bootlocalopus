import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const MIN_GZIP = 1024;

const isCompressible = (type) =>
  type.startsWith('text/') || type === 'application/json' || type === 'image/svg+xml';

function textError(res, status, message, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers });
  res.end(message);
}

/** Maps a URL pathname to an absolute path inside root, or a status code. */
function resolveInside(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return 400;
  }
  if (decoded.includes('\0')) return 400;
  const parts = decoded.split(/[/\\]+/).filter(Boolean); // both separators, on every OS
  const target = path.resolve(root, ...parts);
  const rel = path.relative(root, target);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return 404;
  return target;
}

async function findFile(target) {
  try {
    let info = await stat(target);
    if (info.isDirectory()) {
      target = path.join(target, 'index.html');
      info = await stat(target);
    }
    return info.isFile() ? { file: target, info } : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

function isNotModified(req, etag, mtimeMs) {
  const inm = req.headers['if-none-match'];
  if (inm !== undefined) {
    if (inm.trim() === '*') return true;
    return inm.split(',').map((t) => t.trim().replace(/^W\//, '')).includes(etag);
  }
  const since = Date.parse(req.headers['if-modified-since'] ?? '');
  return !Number.isNaN(since) && Math.floor(mtimeMs / 1000) * 1000 <= since;
}

function parseRange(header, size) {
  if (typeof header !== 'string' || !header.startsWith('bytes=')) return null;
  const m = /^(\d*)-(\d*)$/.exec(header.slice(6));
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const last = m[2] === '' ? Infinity : Number(m[2]);
  if (last < start) return null;
  if (start >= size) return 'unsatisfiable';
  return { start, end: Math.min(last, size - 1) };
}

function acceptsGzip(header) {
  if (!header) return false;
  const q = new Map();
  for (const part of header.split(',')) {
    const [coding, ...params] = part.split(';').map((s) => s.trim().toLowerCase());
    const qp = params.find((p) => p.startsWith('q='));
    q.set(coding, qp ? Number(qp.slice(2)) : 1);
  }
  const quality = q.get('gzip') ?? q.get('*') ?? 0;
  return quality > 0;
}

/** Writes the head, then either ends (304, 416, HEAD) or pipes `streams` into res. */
async function send(res, status, headers, streams = null) {
  res.writeHead(status, headers);
  if (!streams) {
    res.end();
    return;
  }
  try {
    await pipeline(...streams, res);
  } catch {
    res.destroy(); // client went away or the disk failed mid-stream
  }
}

export function createStaticHandler({ root }) {
  const base = path.resolve(root);
  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return textError(res, 405, 'method not allowed', { allow: 'GET, HEAD' });
    }
    const { pathname } = new URL(req.url, 'http://localhost');
    const target = resolveInside(base, pathname);
    if (target === 400) return textError(res, 400, 'bad request');
    if (target === 404) return textError(res, 404, 'not found');
    const found = await findFile(target);
    if (!found) return textError(res, 404, 'not found');

    const { file, info } = found;
    const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const headers = {
      'content-type': type,
      etag,
      'last-modified': info.mtime.toUTCString(),
      'accept-ranges': 'bytes',
    };
    const compressible = isCompressible(type);
    if (compressible) headers.vary = 'Accept-Encoding';

    if (isNotModified(req, etag, info.mtimeMs)) {
      return send(res, 304, headers);
    }

    const head = req.method === 'HEAD';
    const ifRange = req.headers['if-range'];
    const range = ifRange !== undefined && ifRange !== etag ? null : parseRange(req.headers.range, info.size);
    if (range === 'unsatisfiable') {
      return send(res, 416, { ...headers, 'content-range': `bytes */${info.size}` });
    }
    if (range) {
      const { start, end } = range;
      return send(res, 206, {
        ...headers,
        'content-range': `bytes ${start}-${end}/${info.size}`,
        'content-length': end - start + 1,
      }, head ? null : [createReadStream(file, { start, end })]);
    }

    if (compressible && info.size >= MIN_GZIP && acceptsGzip(req.headers['accept-encoding'])) {
      // Different bytes, so not the same strong validator.
      return send(res, 200, { ...headers, etag: `W/${etag}`, 'content-encoding': 'gzip' },
        head ? null : [createReadStream(file), createGzip()]);
    }
    return send(res, 200, { ...headers, 'content-length': info.size },
      head ? null : [createReadStream(file)]);
  };
}
