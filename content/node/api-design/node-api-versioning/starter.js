export const CHANGES = [
  {
    version: '2023-06-01',
    up: (resource) => resource, // TODO: balance (dollars) -> balanceCents
    down: (resource) => resource, // TODO: balanceCents -> balance
  },
  {
    version: '2024-01-01',
    up: (resource) => resource, // TODO: name -> firstName + lastName
    down: (resource) => resource, // TODO: firstName + lastName -> name
  },
];

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

export function versioned(handler, { versions, changes = CHANGES, defaultVersion }) {
  // TODO: resolve the version, upgrade the request's data, downgrade a 2xx
  // response's data, and set the api-version header.
  // Right now every client gets the latest shape, which breaks all of them.
  return async (req, res) => {
    const raw = await readBody(req);
    let body;
    try { body = raw ? JSON.parse(raw) : undefined; } catch { body = undefined; }
    const result = await handler(req, body);
    send(res, result.status, result.body);
  };
}
