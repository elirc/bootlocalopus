const BASE = 'http://app.internal';

export function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  // Browsers strip tabs and newlines inside URLs, so "/\t/evil.io" is "//evil.io".
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return '/';
  let url;
  try {
    url = new URL(value, BASE);
  } catch {
    return '/';
  }
  // Resolve like a browser would; "//evil.io" and "/\evil.io" change the origin.
  if (url.origin !== BASE) return '/';
  return url.pathname + url.search + url.hash;
}

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const redirect = (res, status, location) => {
  res.writeHead(status, { location });
  res.end();
};

async function readJson(req) {
  let text = '';
  for await (const chunk of req) text += chunk;
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function createRedirectHandler({ checkPassword }) {
  return async (req, res) => {
    const queryAt = req.url.indexOf('?');
    const path = queryAt === -1 ? req.url : req.url.slice(0, queryAt);
    const query = queryAt === -1 ? '' : req.url.slice(queryAt);

    if (req.method === 'POST' && path === '/login') {
      const { user, password } = await readJson(req);
      if (checkPassword(user, password) !== true) {
        json(res, 401, { error: 'invalid credentials' });
        return;
      }
      const next = new URLSearchParams(query).get('next');
      redirect(res, 303, safeNext(next ?? '/'));
      return;
    }

    if (path.length > 1 && path.endsWith('/')) {
      // Collapse leading slashes too: "//evil.io/" must not become "//evil.io".
      const canonical = '/' + path.replace(/\/+$/, '').replace(/^\/+/, '');
      const safeMethod = req.method === 'GET' || req.method === 'HEAD';
      redirect(res, safeMethod ? 301 : 308, canonical + query);
      return;
    }

    json(res, 404, { error: 'not found' });
  };
}
