const ALLOWED_METHODS = ['GET', 'PUT'];
const ALLOWED_HEADERS = ['Content-Type', 'If-Match', 'If-None-Match'];

const etagOf = (product) => `"${product.id}-v${product.version}"`;
const tagsOf = (header) => header.split(',').map((tag) => tag.trim()).filter(Boolean);

/** If-None-Match: weak comparison. */
const noneMatch = (header, etag) =>
  header.trim() === '*' || tagsOf(header).some((tag) => tag.replace(/^W\//, '') === etag);

/** If-Match: strong comparison, so a weak tag never matches. */
const ifMatch = (header, etag) =>
  header.trim() === '*' || tagsOf(header).some((tag) => tag === etag);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { ...headers, 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const isValidProduct = (body) =>
  body !== null && typeof body === 'object'
  && typeof body.name === 'string' && body.name.length > 0
  && Number.isInteger(body.price) && body.price >= 0;

export function createApi({ origins, products }) {
  const allowedOrigins = new Set(origins);
  const store = new Map(products.map((p) => [p.id, { ...p, version: 1 }]));
  const allowedHeaderNames = new Set(ALLOWED_HEADERS.map((h) => h.toLowerCase()));

  function preflight(req, res, origin) {
    const method = req.headers['access-control-request-method'].toUpperCase();
    const requested = (req.headers['access-control-request-headers'] ?? '')
      .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
    const ok = allowedOrigins.has(origin)
      && ALLOWED_METHODS.includes(method)
      && requested.every((h) => allowedHeaderNames.has(h));
    if (!ok) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.writeHead(204, {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': ALLOWED_METHODS.join(', '),
      'access-control-allow-headers': ALLOWED_HEADERS.join(', '),
      'access-control-max-age': '600',
    });
    res.end();
  }

  async function route(req, res) {
    const { pathname } = new URL(req.url, 'http://localhost');
    const match = /^\/products\/([^/]+)$/.exec(pathname);
    const product = match && store.get(decodeURIComponent(match[1]));
    if (!product) return sendJson(res, 404, { error: 'not found' });

    if (req.method === 'GET') {
      const headers = { etag: etagOf(product), 'cache-control': 'no-cache' };
      const inm = req.headers['if-none-match'];
      if (inm !== undefined && noneMatch(inm, etagOf(product))) {
        res.writeHead(304, headers);
        res.end();
        return;
      }
      const { id, name, price } = product;
      return sendJson(res, 200, { id, name, price }, headers);
    }

    if (req.method === 'PUT') {
      const im = req.headers['if-match'];
      if (im === undefined) return sendJson(res, 428, { error: 'precondition required' });
      if (!ifMatch(im, etagOf(product))) return sendJson(res, 412, { error: 'precondition failed' });

      const mediaType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (mediaType !== 'application/json') return sendJson(res, 415, { error: 'unsupported media type' });

      let body;
      try { body = JSON.parse(await readBody(req)); } catch { body = null; }
      if (!isValidProduct(body)) return sendJson(res, 400, { error: 'invalid body' });

      // Nothing awaits between the If-Match check and here except the body
      // read, so re-check: another PUT may have landed while it streamed in.
      if (!ifMatch(im, etagOf(product))) return sendJson(res, 412, { error: 'precondition failed' });
      product.name = body.name;
      product.price = body.price;
      product.version += 1;
      const { id, name, price } = product;
      return sendJson(res, 200, { id, name, price }, { etag: etagOf(product) });
    }

    return sendJson(res, 405, { error: 'method not allowed' }, { allow: 'GET, PUT' });
  }

  return async (req, res) => {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS' && req.headers['access-control-request-method'] !== undefined) {
      return preflight(req, res, origin);
    }

    // Set before routing, so errors and 304s carry them too.
    if (typeof origin === 'string' && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Expose-Headers', 'ETag');
    }

    try {
      await route(req, res);
    } catch {
      if (!res.headersSent) sendJson(res, 500, { error: 'internal' });
      else res.end();
    }
  };
}
