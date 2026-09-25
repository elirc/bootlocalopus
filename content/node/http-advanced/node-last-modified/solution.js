import { createHash } from 'node:crypto';

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
};

const etagOf = (body) => `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`;

const stripWeak = (tag) => (tag.startsWith('W/') ? tag.slice(2) : tag);

function noneMatch(header, etag) {
  if (header.trim() === '*') return true;
  return header.split(',').some((tag) => stripWeak(tag.trim()) === etag);
}

function notModifiedSince(header, updatedAt, now) {
  const since = Date.parse(header);
  if (Number.isNaN(since) || since > now) return false; // invalid or from the future: ignore
  // HTTP dates have whole-second precision; compare at that precision.
  const modified = Math.floor(updatedAt.getTime() / 1000) * 1000;
  return modified <= since;
}

export function createDocHandler(store, { now = Date.now } = {}) {
  return (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const match = /^\/docs\/([^/]+)$/.exec(pathname);
    if (!match) return json(res, 404, { error: 'not found' });
    const doc = store.get(decodeURIComponent(match[1]));
    if (!doc) return json(res, 404, { error: 'not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json(res, 405, { error: 'method not allowed' }, { allow: 'GET, HEAD' });
    }

    const etag = etagOf(doc.body);
    const validators = { etag, 'last-modified': doc.updatedAt.toUTCString() };

    const inm = req.headers['if-none-match'];
    const ims = req.headers['if-modified-since'];
    const fresh = inm !== undefined
      ? noneMatch(inm, etag) // If-None-Match wins; If-Modified-Since is not consulted
      : ims !== undefined && notModifiedSince(ims, doc.updatedAt, now());

    if (fresh) {
      res.writeHead(304, validators);
      res.end();
      return;
    }
    const body = Buffer.from(doc.body);
    res.writeHead(200, {
      ...validators,
      'content-type': 'text/plain; charset=utf-8',
      'content-length': body.length,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}
