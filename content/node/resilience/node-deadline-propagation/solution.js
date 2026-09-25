import http from 'node:http';

const HEADER = 'x-request-timeout-ms';

export function readBudget(headers, { defaultMs = 10_000, maxMs = 30_000 } = {}) {
  const raw = headers[HEADER];
  // Strict digits only: Number('1e3'), Number('') and parseInt('5ms') all "work".
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return defaultMs;
  return Math.min(Number(raw), maxMs);
}

export function createDeadline(budgetMs, { now = Date.now } = {}) {
  const expiresAt = now() + budgetMs;
  const remaining = () => Math.max(0, expiresAt - now());
  return {
    remaining,
    expired: () => remaining() === 0,
    child: (capMs) => createDeadline(Math.min(remaining(), capMs), { now }),
    // A relative budget travels between hosts without trusting their clocks.
    outgoingHeaders: (marginMs = 0) => ({ [HEADER]: String(Math.max(0, remaining() - marginMs)) }),
  };
}

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export function createServer({ lookupPrice, now = Date.now, defaultMs = 10_000, maxMs = 30_000, marginMs = 20, minBudgetMs = 50 }) {
  return http.createServer(async (req, res) => {
    const match = req.method === 'GET' && /^\/price\/([^/?]+)$/.exec(req.url.split('?')[0]);
    let sku;
    try {
      sku = match && decodeURIComponent(match[1]);
    } catch {}
    if (!sku) return send(res, 404, { error: 'not-found' });

    const deadline = createDeadline(readBudget(req.headers, { defaultMs, maxMs }), { now });
    // Not enough time to do anything useful: say so now rather than time out later.
    if (deadline.remaining() < minBudgetMs) return send(res, 504, { error: 'insufficient-deadline' });

    let price;
    try {
      price = await lookupPrice(sku, { headers: deadline.outgoingHeaders(marginMs), deadline });
    } catch {
      return send(res, 502, { error: 'upstream-failed' });
    }
    if (deadline.expired()) return send(res, 504, { error: 'deadline-exceeded' });
    send(res, 200, { sku, price });
  });
}
