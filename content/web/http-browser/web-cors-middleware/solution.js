export function withCors(options, handler) {
  const {
    origins,
    credentials = false,
    methods = ['GET', 'HEAD', 'POST'],
    allowHeaders = [],
    exposeHeaders = [],
    maxAge = 600,
  } = options;

  // Exact matches only: a Set lookup cannot be fooled by a suffix or a prefix.
  const allowedOrigins = new Set(origins.filter((o) => o !== 'null'));
  const allowedMethods = new Set(methods.map((m) => m.toUpperCase()));
  const allowedHeaders = new Set(allowHeaders.map((h) => h.toLowerCase()));

  const isAllowed = (origin) => typeof origin === 'string' && allowedOrigins.has(origin);

  return (req, res) => {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');

    const requestedMethod = req.headers['access-control-request-method'];
    if (req.method === 'OPTIONS' && requestedMethod !== undefined) {
      const requestedHeaders = (req.headers['access-control-request-headers'] ?? '')
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean);

      const ok = isAllowed(origin)
        && allowedMethods.has(requestedMethod.toUpperCase())
        && requestedHeaders.every((h) => allowedHeaders.has(h));
      if (!ok) {
        res.writeHead(403);
        res.end();
        return;
      }

      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
      if (allowHeaders.length) res.setHeader('Access-Control-Allow-Headers', allowHeaders.join(', '));
      res.setHeader('Access-Control-Max-Age', String(maxAge));
      if (credentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.writeHead(204);
      res.end();
      return;
    }

    // Set before the handler runs, so they survive whatever status it picks.
    if (isAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      if (credentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
      if (exposeHeaders.length) res.setHeader('Access-Control-Expose-Headers', exposeHeaders.join(', '));
    }
    return handler(req, res);
  };
}
