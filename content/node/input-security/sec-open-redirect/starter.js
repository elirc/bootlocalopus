import http from 'node:http';

export function safeRedirect(next, { allowedOrigins = [], fallback = '/' } = {}) {
  // Looks reasonable. Is not. See the brief.
  if (typeof next === 'string' && next.startsWith('/')) return next;
  if (typeof next === 'string' && allowedOrigins.some((o) => next.startsWith(o))) return next;
  return fallback;
}

export function createServer({ allowedOrigins = [] } = {}) {
  return http.createServer((req, res) => {
    // TODO: GET /continue?next=... → 303 to safeRedirect(...), else 404.
    res.writeHead(501);
    res.end();
  });
}
