// Same behaviour: regex header parsing, hex-string comparison, a Map of handled events, reworded bodies.
import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const TOLERANCE_SECONDS = 300;

function parseSignature(header) {
  const fields = new Map();
  for (const part of String(header || '').split(',')) {
    const m = /^\s*(\w+)=(.*?)\s*$/.exec(part);
    if (m) fields.set(m[1], m[2]);
  }
  const ts = fields.get('t');
  const given = fields.get('v1');
  return /^\d+$/.test(ts ?? '') && /^[0-9a-f]{64}$/.test(given ?? '') ? [ts, given] : null;
}

export function createApp({ secret, onEvent, now = () => Date.now() }) {
  const handled = new Map(); // id -> time handled

  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  const reject = (res, status, code) => json(res, status, { error: { message: 'webhook rejected', code } });

  function verify(header, raw) {
    const parsed = parseSignature(header);
    if (!parsed) return 'INVALID_SIGNATURE';
    const [ts, given] = parsed;
    const want = createHmac('sha256', secret).update(ts + '.' + raw).digest('hex');
    if (!timingSafeEqual(Buffer.from(want), Buffer.from(given))) return 'INVALID_SIGNATURE';
    const skew = Math.abs(Math.floor(now()) - Number(ts) * 1000);
    if (skew > TOLERANCE_SECONDS * 1000) return 'STALE_SIGNATURE';
    return null;
  }

  return http.createServer(async (req, res) => {
    if (req.url !== '/webhooks' || req.method !== 'POST') return reject(res, 404, 'NOT_FOUND');

    let raw = '';
    req.setEncoding('utf8');
    for await (const piece of req) raw += piece;

    const problem = verify(req.headers['x-signature'], raw);
    if (problem) return reject(res, 401, problem);

    let event;
    try { event = JSON.parse(raw); } catch { return reject(res, 400, 'INVALID_JSON'); }

    if (handled.has(event.id)) return json(res, 200, { duplicate: true, received: true });
    try {
      await onEvent(event);
      handled.set(event.id, now());
      return json(res, 200, { received: true });
    } catch {
      return reject(res, 500, 'HANDLER_FAILED');
    }
  });
}
