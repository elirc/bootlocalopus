import http from 'node:http';

const HEADER = 'x-request-timeout-ms';
const RETRYABLE = new Set([429, 502, 503, 504]);

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

const readBudget = (headers, defaultMs, maxMs) => {
  const raw = headers[HEADER];
  return typeof raw === 'string' && /^\d+$/.test(raw) ? Math.min(Number(raw), maxMs) : defaultMs;
};

const createRetryBudget = ({ ratio, minRetries, windowMs, now }) => {
  const requests = [];
  const retries = [];
  const prune = () => {
    const t = now();
    while (requests.length && t - requests[0] >= windowMs) requests.shift();
    while (retries.length && t - retries[0] >= windowMs) retries.shift();
  };
  return {
    recordRequest() { prune(); requests.push(now()); },
    tryRetry() {
      prune();
      if (retries.length >= Math.max(minRetries, Math.floor(ratio * requests.length))) return false;
      retries.push(now());
      return true;
    },
  };
};

export function createGateway({
  upstream,
  defaultMs = 2000,
  maxMs = 5000,
  marginMs = 20,
  minBudgetMs = 50,
  maxConcurrent = 4,
  maxAttempts = 3,
  baseMs = 50,
  retryRatio = 0.1,
  minRetries = 3,
  retryWindowMs = 10_000,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  random = Math.random,
}) {
  let active = 0; // the bulkhead: live lookups in progress
  const lastGood = new Map(); // sku -> price
  const retryBudget = createRetryBudget({ ratio: retryRatio, minRetries, windowMs: retryWindowMs, now });

  /** One upstream attempt: { kind: 'ok', price } | { kind: 'missing' } | { kind: 'retryable', retryAfterMs? } | { kind: 'failed' } */
  const attemptOnce = async (sku, remaining) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const res = await fetch(`${upstream}/price/${encodeURIComponent(sku)}`, {
        signal: controller.signal,
        headers: { [HEADER]: String(Math.max(0, remaining - marginMs)) },
      });
      const text = await res.text(); // always drain, so the socket can be reused
      if (res.status === 200) {
        let price;
        try {
          price = JSON.parse(text).price;
        } catch {}
        return typeof price === 'number' ? { kind: 'ok', price } : { kind: 'failed' };
      }
      if (res.status === 404) return { kind: 'missing' };
      if (RETRYABLE.has(res.status)) {
        const after = res.headers.get('retry-after');
        return { kind: 'retryable', retryAfterMs: after !== null && /^\d+$/.test(after) ? Number(after) * 1000 : undefined };
      }
      return { kind: 'failed' };
    } catch {
      // Our own deadline abort is final; any other network error is worth a retry.
      return controller.signal.aborted ? { kind: 'failed' } : { kind: 'retryable' };
    } finally {
      clearTimeout(timer);
    }
  };

  /** The live price, 'missing', or undefined when it could not be had in time. */
  const lookup = async (sku, deadline) => {
    retryBudget.recordRequest();
    for (let attempt = 1; ; attempt++) {
      const result = await attemptOnce(sku, deadline.remaining());
      if (result.kind === 'ok' || result.kind === 'missing') return result;
      if (result.kind === 'failed' || attempt >= maxAttempts) return undefined;

      const delay = result.retryAfterMs ?? Math.floor(random() * baseMs * 2 ** (attempt - 1));
      // Only retry if there is time left to wait *and* do something useful; ask the budget last.
      if (delay + minBudgetMs > deadline.remaining()) return undefined;
      if (!retryBudget.tryRetry()) return undefined;
      await sleep(delay);
    }
  };

  const server = http.createServer(async (req, res) => {
    try {
      const match = req.method === 'GET' && /^\/quote\/([A-Za-z0-9_-]+)$/.exec(req.url.split('?')[0]);
      if (!match) return send(res, 404, { error: 'not-found' });
      const sku = match[1];

      const expiresAt = now() + readBudget(req.headers, defaultMs, maxMs);
      const deadline = { remaining: () => Math.max(0, expiresAt - now()) };
      if (deadline.remaining() < minBudgetMs) return send(res, 504, { error: 'insufficient-deadline' });

      if (active >= maxConcurrent) return send(res, 503, { error: 'busy' }, { 'retry-after': '1' });
      active++;
      let result;
      try {
        result = await lookup(sku, deadline);
      } finally {
        active--;
      }

      if (result?.kind === 'missing') return send(res, 404, { error: 'unknown-sku' });
      if (result?.kind === 'ok') {
        lastGood.set(sku, result.price);
        return send(res, 200, { sku, price: result.price, source: 'live' });
      }
      if (lastGood.has(sku)) return send(res, 200, { sku, price: lastGood.get(sku), source: 'stale' });
      if (deadline.remaining() === 0) return send(res, 504, { error: 'deadline-exceeded' });
      send(res, 502, { error: 'upstream-failed' });
    } catch {
      if (!res.headersSent) send(res, 500, { error: 'internal' });
    }
  });

  return { server };
}
