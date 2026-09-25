import http from 'node:http';

/** `seed`: [{ id, title, body }]. Every article starts at version 1. */
export function createApp({ seed = [] } = {}) {
  const articles = new Map(seed.map((a) => [a.id, { ...a, version: 1 }]));

  const etagOf = (article) => `"v${article.version}"`;

  /** If-None-Match is a list of tags, or `*`. The comparison is weak: W/"x" matches "x". */
  const matches = (header, etag) => {
    if (!header) return false;
    if (header.trim() === '*') return true;
    const strip = (tag) => tag.trim().replace(/^W\//, '');
    return header.split(',').some((tag) => strip(tag) === strip(etag));
  };

  const sendJson = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };

  const readJson = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  };

  return http.createServer(async (req, res) => {
    const match = new URL(req.url, 'http://localhost').pathname.match(/^\/articles\/([^/]+)$/);
    const article = match && articles.get(match[1]);
    if (!article) return sendJson(res, 404, { error: { code: 'NOT_FOUND' } });

    // Caches may keep the response, but must check with us before reusing it.
    const cacheHeaders = () => ({ etag: etagOf(article), 'cache-control': 'no-cache' });

    if (req.method === 'GET') {
      if (matches(req.headers['if-none-match'], etagOf(article))) {
        res.writeHead(304);
        return res.end();
      }
      return sendJson(res, 200, article, cacheHeaders());
    }

    if (req.method === 'PUT') {
      const input = await readJson(req);
      article.title = String(input.title ?? article.title);
      article.body = String(input.body ?? article.body);
      article.version += 1;
      return sendJson(res, 200, article, cacheHeaders());
    }

    res.writeHead(405, { allow: 'GET, PUT' });
    return res.end();
  });
}
