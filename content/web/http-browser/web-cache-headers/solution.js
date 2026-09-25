import { createHash } from 'node:crypto';

const FINGERPRINTED = /[.-][0-9a-f]{8,}\.[a-z0-9]+$/i;

export function cacheControlFor(pathname) {
  if (FINGERPRINTED.test(pathname)) return 'public, max-age=31536000, immutable';
  if (pathname.endsWith('.html') || pathname.endsWith('/')) return 'no-cache';
  return 'public, max-age=3600';
}

/** Weak comparison: `W/"x"` and `"x"` name the same representation. */
function matchesIfNoneMatch(header, etag) {
  if (header.trim() === '*') return true;
  const strip = (tag) => tag.trim().replace(/^W\//, '');
  return header.split(',').some((tag) => strip(tag) === etag);
}

export function createAssetHandler(assets) {
  // Precompute once: hashing on every request is wasted work.
  const table = new Map(Object.entries(assets).map(([pathname, { body, type }]) => {
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    const etag = `"${createHash('sha256').update(bytes).digest('base64url').slice(0, 27)}"`;
    return [pathname, { bytes, type, etag, cacheControl: cacheControlFor(pathname) }];
  }));

  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' });
      res.end();
      return;
    }

    const { pathname } = new URL(req.url, 'http://localhost');
    const asset = table.get(pathname);
    if (!asset) {
      res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      res.end('not found');
      return;
    }

    const validators = { etag: asset.etag, 'cache-control': asset.cacheControl };
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch !== undefined && matchesIfNoneMatch(ifNoneMatch, asset.etag)) {
      res.writeHead(304, validators);
      res.end();
      return;
    }

    res.writeHead(200, {
      ...validators,
      'content-type': asset.type,
      'content-length': asset.bytes.length, // bytes, not characters
    });
    res.end(req.method === 'HEAD' ? undefined : asset.bytes);
  };
}
