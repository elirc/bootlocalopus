import http from 'node:http';

const BASE = 'http://base.invalid';
// Browsers silently drop tab/CR/LF inside URLs, turning "/\t/evil.io" into
// "//evil.io" after we have looked at it. Refuse every control character.
const CONTROL = /[\x00-\x1f\x7f]/;

const parse = (input, base) => {
  try {
    return new URL(input, base);
  } catch {
    return undefined;
  }
};

export function safeRedirect(next, { allowedOrigins = [], fallback = '/' } = {}) {
  if (typeof next !== 'string' || next.length > 2048 || CONTROL.test(next)) return fallback;

  if (next.startsWith('/')) {
    // "//host" is protocol-relative and browsers read "/\host" the same way.
    if (next[1] === '/' || next[1] === '\\') return fallback;
    const url = parse(next, BASE);
    if (!url || url.origin !== BASE) return fallback;
    // Redirect to what we parsed, not to the raw string.
    return url.pathname + url.search + url.hash;
  }

  const url = parse(next);
  if (!url) return fallback;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback;
  if (url.username !== '' || url.password !== '') return fallback;
  if (!allowedOrigins.includes(url.origin)) return fallback;
  return url.href;
}

export function createServer({ allowedOrigins = [] } = {}) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, BASE);
    if (req.method !== 'GET' || url.pathname !== '/continue') {
      res.writeHead(404);
      res.end();
      return;
    }
    const location = safeRedirect(url.searchParams.get('next'), { allowedOrigins });
    res.writeHead(303, { location, 'cache-control': 'no-store' });
    res.end();
  });
}
