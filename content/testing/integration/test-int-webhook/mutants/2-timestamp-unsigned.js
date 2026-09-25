import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const TOLERANCE_SECONDS = 300;

/**
 * POST /webhooks from a payment provider.
 * Header `X-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${rawBody}`>`.
 * `onEvent(event)` does the work; `now()` is the time in milliseconds.
 */
export function createApp({ secret, onEvent, now = Date.now }) {
  const processed = new Set(); // event ids that were handled successfully

  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const fail = (res, status, code) => send(res, status, { error: { code } });

  const parseHeader = (header) => {
    const parts = Object.fromEntries(
      String(header ?? '').split(',').map((kv) => kv.trim().split('=')).filter((kv) => kv.length === 2),
    );
    const t = Number(parts.t);
    return Number.isInteger(t) && /^[0-9a-f]{64}$/.test(parts.v1 ?? '') ? { t, v1: parts.v1 } : null;
  };

  return http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/webhooks') return fail(res, 404, 'NOT_FOUND');

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8'); // sign what was sent, byte for byte

    const sig = parseHeader(req.headers['x-signature']);
    if (!sig) return fail(res, 401, 'INVALID_SIGNATURE');

    const expected = createHmac('sha256', secret).update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(sig.v1, 'hex'))) return fail(res, 401, 'INVALID_SIGNATURE');

    // The timestamp is signed, so an attacker cannot refresh it. Reject old and far-future ones.
    if (Math.abs(now() / 1000 - sig.t) > TOLERANCE_SECONDS) return fail(res, 401, 'STALE_SIGNATURE');

    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return fail(res, 400, 'INVALID_JSON');
    }

    // Providers deliver at least once: acknowledge a duplicate without doing the work again.
    if (processed.has(event.id)) return send(res, 200, { received: true, duplicate: true });

    try {
      await onEvent(event);
    } catch {
      // Not marked as processed, and not a 2xx: the provider will retry.
      return fail(res, 500, 'HANDLER_FAILED');
    }
    processed.add(event.id);
    return send(res, 200, { received: true });
  });
}
