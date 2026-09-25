function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

export function createOrdersApi({ now = Date.now } = {}) {
  const orders = new Map();

  return async (req, res) => {
    await readBody(req);
    // TODO: POST /orders (idempotent), GET /orders (filters, sort, cursor),
    // GET /orders/:id (ETag), PATCH /orders/:id (merge patch + If-Match),
    // plus 404 and 405 for everything else.
    send(res, 501, { error: { code: 'NOT_IMPLEMENTED', message: 'todo' } });
  };
}
