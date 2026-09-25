// Same behaviour: ETags are content hashes instead of versions, and Cache-Control carries an extra directive.
import http from 'node:http';
import { createHash } from 'node:crypto';

export function createApp({ seed = [] } = {}) {
  const articles = new Map();
  for (const a of seed) articles.set(a.id, { id: a.id, title: a.title, body: a.body, version: 1 });

  const tag = (a) => '"' + createHash('sha256').update(JSON.stringify([a.id, a.title, a.body, a.version])).digest('base64url').slice(0, 20) + '"';
  const opaque = (t) => t.trim().replace(/^W\//i, '');

  function fresh(ifNoneMatch, current) {
    if (ifNoneMatch === undefined) return false;
    const tags = ifNoneMatch.split(',').map(opaque);
    return tags.includes('*') || tags.includes(opaque(current));
  }

  return http.createServer(async (req, res) => {
    const id = /^\/articles\/([^/]+)$/.exec(new URL(req.url, 'http://h').pathname)?.[1];
    const a = id === undefined ? undefined : articles.get(id);
    if (!a) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: { code: 'NOT_FOUND' } }));
    }

    const respond = (status) => {
      const headers = { 'cache-control': 'private, no-cache', etag: tag(a) };
      if (status === 304) {
        res.writeHead(304, headers);
        return res.end();
      }
      res.writeHead(status, { ...headers, 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ version: a.version, body: a.body, title: a.title, id: a.id }));
    };

    switch (req.method) {
      case 'GET':
        return respond(fresh(req.headers['if-none-match'], tag(a)) ? 304 : 200);
      case 'PUT': {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const input = raw ? JSON.parse(raw) : {};
        if (input.title != null) a.title = String(input.title);
        if (input.body != null) a.body = String(input.body);
        a.version++;
        return respond(200);
      }
      default:
        res.writeHead(405, { allow: 'PUT, GET' });
        return res.end();
    }
  });
}
