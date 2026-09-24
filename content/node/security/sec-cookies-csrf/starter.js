import crypto from 'node:crypto';

export function createAuthApp({ users, allowedOrigin, ttlSeconds = 3600, now = Date.now }) {
  const sessions = new Map(); // sid -> { username, csrfToken, createdAt }

  const send = (res, status, body, headers = {}) => {
    if (body === undefined) {
      res.writeHead(status, headers);
      return res.end();
    }
    res.writeHead(status, { ...headers, 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const readJson = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      return {};
    }
  };

  return async (req, res) => {
    // TODO: parse the Cookie header, then route:
    //   POST /login, GET /me, POST /transfer, POST /logout, else 404.
    // Multiple Set-Cookie headers: pass an array, e.g.
    //   res.writeHead(200, { 'set-cookie': [first, second] })
    // (This stub answers 501 so the tests fail fast instead of hanging.)
    send(res, 501, { error: 'not implemented' });
  };
}
