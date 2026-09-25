// Same behaviour: separate maps for in-flight and finished keys, a deep-equal instead of a
// canonical string, random payment ids, and the charge result kept as a promise.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && sameValue(a[k], b[k]));
}

export function createApp({ charge }) {
  const inFlight = new Map(); // key -> request body
  const finished = new Map(); // key -> { request, response }

  const json = (res, status, payload, extra) => {
    res.writeHead(status, { ...extra, 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  };
  const error = (res, status, code) => json(res, status, { error: { code, message: code.replaceAll('_', ' ').toLowerCase() } });

  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://h');
    if (pathname !== '/payments' || req.method !== 'POST') return error(res, 404, 'NOT_FOUND');

    const key = req.headers['idempotency-key'] ?? '';
    if (key.length === 0) return error(res, 400, 'IDEMPOTENCY_KEY_REQUIRED');

    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body;
    try { body = JSON.parse(raw); } catch { body = undefined; }
    if (typeof body?.customerId !== 'string' || !Number.isInteger(body?.amountCents) || body.amountCents < 1) {
      return error(res, 400, 'VALIDATION');
    }

    const done = finished.get(key);
    if (done) {
      if (!sameValue(done.request, body)) return error(res, 422, 'IDEMPOTENCY_KEY_REUSED');
      return json(res, done.response.status, done.response.payload, { 'idempotent-replayed': 'true' });
    }
    if (inFlight.has(key)) {
      return sameValue(inFlight.get(key), body)
        ? error(res, 409, 'IDEMPOTENCY_KEY_IN_USE')
        : error(res, 422, 'IDEMPOTENCY_KEY_REUSED');
    }

    inFlight.set(key, body);
    let result;
    try {
      result = await charge({ customerId: body.customerId, amountCents: body.amountCents });
    } catch {
      inFlight.delete(key);
      return error(res, 502, 'PAYMENT_FAILED');
    }
    inFlight.delete(key);
    const payload = { chargeId: result.chargeId, amountCents: body.amountCents, customerId: body.customerId, id: 'pay_' + randomUUID() };
    finished.set(key, { request: body, response: { status: 201, payload } });
    return json(res, 201, payload);
  });
}
