import http from 'node:http';

const USERS = [
  { id: '1', name: 'ada' },
  { id: '2', name: 'bob' },
];

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export function createServer() {
  return http.createServer((req, res) => {
    // A relative URL needs a base; the host is irrelevant for parsing.
    const { pathname } = new URL(req.url, 'http://localhost');

    if (pathname === '/health') {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET', 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'method not allowed' }));
      }
      return send(res, 200, { status: 'ok' });
    }

    if (pathname === '/users') {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET', 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'method not allowed' }));
      }
      return send(res, 200, USERS);
    }

    const match = pathname.match(/^\/users\/([^/]+)$/);
    if (match) {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET', 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'method not allowed' }));
      }
      const user = USERS.find((u) => u.id === match[1]);
      return user ? send(res, 200, user) : send(res, 404, { error: 'not found' });
    }

    return send(res, 404, { error: 'not found' });
  });
}
