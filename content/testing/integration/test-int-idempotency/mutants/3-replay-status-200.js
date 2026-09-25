import http from 'node:http';

/** JSON with object keys sorted, so `{a, b}` and `{b, a}` compare equal. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * POST /payments, made safe to retry with an Idempotency-Key header.
 * `charge({ customerId, amountCents })` talks to the payment provider and resolves to { chargeId }.
 */
export function createApp({ charge }) {
  // key -> { fingerprint, state: 'in-flight' } | { fingerprint, state: 'done', status, body }
  const keys = new Map();
  let nextId = 1;

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };
  const fail = (res, status, code) => send(res, status, { error: { code } });

  const readJson = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return null;
    }
  };

  return http.createServer(async (req, res) => {
    if (req.method !== 'POST' || new URL(req.url, 'http://localhost').pathname !== '/payments') {
      return fail(res, 404, 'NOT_FOUND');
    }

    const key = req.headers['idempotency-key'];
    if (!key) return fail(res, 400, 'IDEMPOTENCY_KEY_REQUIRED');

    const input = await readJson(req);
    const valid = input && typeof input.customerId === 'string' && Number.isInteger(input.amountCents) && input.amountCents > 0;
    if (!valid) return fail(res, 400, 'VALIDATION'); // nothing is stored, so the client can fix the body and retry

    const fingerprint = canonical(input);
    const seen = keys.get(key);
    if (seen) {
      if (seen.fingerprint !== fingerprint) return fail(res, 422, 'IDEMPOTENCY_KEY_REUSED');
      if (seen.state === 'in-flight') return fail(res, 409, 'IDEMPOTENCY_KEY_IN_USE');
      return send(res, 200, seen.body, { 'idempotent-replayed': 'true' });
    }

    keys.set(key, { fingerprint, state: 'in-flight' });
    try {
      const { chargeId } = await charge({ customerId: input.customerId, amountCents: input.amountCents });
      const body = { id: `pay_${nextId++}`, customerId: input.customerId, amountCents: input.amountCents, chargeId };
      keys.set(key, { fingerprint, state: 'done', status: 201, body });
      return send(res, 201, body);
    } catch {
      // Nothing was charged: release the key so a retry can try again.
      keys.delete(key);
      return fail(res, 502, 'PAYMENT_FAILED');
    }
  });
}
