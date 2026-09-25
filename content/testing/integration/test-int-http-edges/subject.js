import http from 'node:http';

export const MAX_BODY_BYTES = 1024;

export function createApp() {
  const bookmarks = new Map();
  let nextId = 1;

  const send = (res, status, body, headers = {}) => {
    if (body === undefined) {
      res.writeHead(status, headers);
      return res.end();
    }
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };
  const fail = (res, status, code, message, headers) => send(res, status, { error: { code, message } }, headers);
  const notAllowed = (res, allow) =>
    fail(res, 405, 'METHOD_NOT_ALLOWED', 'method not allowed', { allow: allow.join(', ') });

  /** Reads the whole body, but stops keeping it once it is over the limit. */
  const readBody = async (req) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    }
    return size > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString('utf8');
  };

  const create = async (req, res) => {
    // `application/json; charset=utf-8` is JSON too: compare the media type only.
    const mediaType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (mediaType !== 'application/json') {
      return fail(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'send application/json');
    }
    const raw = await readBody(req);
    if (raw === null) return fail(res, 413, 'PAYLOAD_TOO_LARGE', `bodies are limited to ${MAX_BODY_BYTES} bytes`);

    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return fail(res, 400, 'INVALID_JSON', 'the body is not valid JSON');
    }
    if (typeof input !== 'object' || input === null || typeof input.url !== 'string' || !/^https?:\/\//.test(input.url)) {
      return fail(res, 400, 'VALIDATION', 'url must be an http(s) URL');
    }

    const bookmark = { id: String(nextId++), url: input.url, note: typeof input.note === 'string' ? input.note : '' };
    bookmarks.set(bookmark.id, bookmark);
    return send(res, 201, bookmark, { location: `/bookmarks/${bookmark.id}` });
  };

  return http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');

      if (pathname === '/bookmarks') {
        if (req.method === 'GET') return send(res, 200, { items: [...bookmarks.values()] });
        if (req.method === 'POST') return await create(req, res);
        return notAllowed(res, ['GET', 'POST']);
      }

      const match = pathname.match(/^\/bookmarks\/([^/]+)$/);
      if (match) {
        const bookmark = bookmarks.get(match[1]);
        if (req.method === 'GET') {
          return bookmark ? send(res, 200, bookmark) : fail(res, 404, 'NOT_FOUND', 'no such bookmark');
        }
        if (req.method === 'DELETE') {
          if (!bookmark) return fail(res, 404, 'NOT_FOUND', 'no such bookmark');
          bookmarks.delete(match[1]);
          return send(res, 204);
        }
        return notAllowed(res, ['GET', 'DELETE']);
      }

      return fail(res, 404, 'NOT_FOUND', 'no such route');
    } catch {
      return fail(res, 500, 'INTERNAL', 'internal error');
    }
  });
}
