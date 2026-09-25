import { createHash } from 'node:crypto';

const KEY = /^[A-Za-z0-9_-]{1,64}$/;

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

const error = (code, message) => ({ error: { code, message } });

const fingerprintOf = (req, rawBody) =>
  createHash('sha256').update(JSON.stringify([req.method, req.url, rawBody])).digest('hex');

export function withIdempotency(handler, { now = Date.now, ttlMs = 86_400_000 } = {}) {
  // key -> { fingerprint, state: 'running' } | { fingerprint, state: 'done', status, body, storedAt }
  const records = new Map();

  async function run(req, rawBody) {
    try {
      return await handler(req, rawBody);
    } catch {
      return { status: 500, body: error('INTERNAL', 'internal server error') };
    }
  }

  return async (req, res) => {
    const rawBody = await readBody(req);
    const key = req.headers['idempotency-key'];

    if (req.method !== 'POST' || key === undefined) {
      const { status, body } = await run(req, rawBody);
      return send(res, status, body);
    }
    if (!KEY.test(key)) {
      return send(res, 400, error('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 1-64 characters of A-Z a-z 0-9 _ -'));
    }

    const fingerprint = fingerprintOf(req, rawBody);
    let record = records.get(key);
    if (record?.state === 'done' && now() - record.storedAt >= ttlMs) {
      records.delete(key);
      record = undefined;
    }

    if (record) {
      if (record.fingerprint !== fingerprint) {
        return send(res, 422, error('IDEMPOTENCY_KEY_REUSED', 'this key was used for a different request'));
      }
      if (record.state === 'running') {
        return send(res, 409, error('IDEMPOTENCY_KEY_IN_USE', 'a request with this key is in progress'), { 'retry-after': '1' });
      }
      return send(res, record.status, record.body, { 'idempotent-replayed': 'true' });
    }

    // Claim the key synchronously, before any await: a concurrent retry must
    // see "running", not "nothing here yet".
    records.set(key, { fingerprint, state: 'running' });
    const { status, body } = await run(req, rawBody);
    if (status < 500) {
      records.set(key, { fingerprint, state: 'done', status, body, storedAt: now() });
    } else {
      // Nothing durable happened: let the client retry with the same key.
      records.delete(key);
    }
    send(res, status, body);
  };
}
