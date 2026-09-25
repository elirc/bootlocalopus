function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

export function withIdempotency(handler, { now = Date.now, ttlMs = 86_400_000 } = {}) {
  // TODO: remember responses per Idempotency-Key: validate the key, claim it
  // before running the handler, replay, refuse reuse, forget 5xx, expire.
  // Right now every retry runs the handler again: the double charge.
  return async (req, res) => {
    const rawBody = await readBody(req);
    const { status, body } = await handler(req, rawBody).catch(() => ({ status: 501, body: { error: 'TODO' } }));
    send(res, status, body);
  };
}
