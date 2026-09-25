import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const BUCKETS = [0.1, 0.5, 1];
const TRACEPARENT = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-.*)?$/;

const randomIds = {
  traceId: () => randomBytes(16).toString('hex'),
  spanId: () => randomBytes(8).toString('hex'),
};

function parseTraceparent(header) {
  const m = typeof header === 'string' ? TRACEPARENT.exec(header) : null;
  if (!m) return null;
  const [, version, traceId, parentId, flags, rest] = m;
  if (version === 'ff' || (version === '00' && rest !== undefined)) return null;
  if (/^0+$/.test(traceId) || /^0+$/.test(parentId)) return null;
  return { traceId, parentId, flags: parseInt(flags, 16) };
}

function compile(template) {
  const parts = template.split('/').filter(Boolean);
  return (pathname) => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length !== parts.length) return null;
    const params = {};
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(segments[i]);
      else if (parts[i] !== segments[i]) return null;
    }
    return params;
  };
}

const escapeLabel = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createService({
  routes,
  checks = [],
  checkTimeoutMs = 1000,
  report = () => {},
  now = () => performance.now(),
  ids = randomIds,
  timers = { setTimeout, clearTimeout },
}) {
  const table = routes.map((r) => ({ ...r, match: compile(r.path) }));
  const trace = new AsyncLocalStorage();
  const requests = new Map();
  const durations = new Map();
  let draining = false;

  /* ------------------------------------------------------------ metrics */

  function record(method, route, status, seconds) {
    const rKey = JSON.stringify([method, route, status]);
    const r = requests.get(rKey) ?? { method, route, status, count: 0 };
    r.count++;
    requests.set(rKey, r);
    const dKey = JSON.stringify([method, route]);
    const d = durations.get(dKey) ?? { method, route, buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
    BUCKETS.forEach((le, i) => { if (seconds <= le) d.buckets[i]++; });
    d.sum += seconds;
    d.count++;
    durations.set(dKey, d);
  }

  function exposition() {
    const lines = ['# TYPE http_requests_total counter'];
    for (const r of requests.values()) {
      lines.push(`http_requests_total{method="${escapeLabel(r.method)}",route="${escapeLabel(r.route)}",status="${r.status}"} ${r.count}`);
    }
    lines.push('# TYPE http_request_duration_seconds histogram');
    for (const d of durations.values()) {
      const base = `method="${escapeLabel(d.method)}",route="${escapeLabel(d.route)}"`;
      BUCKETS.forEach((le, i) => lines.push(`http_request_duration_seconds_bucket{${base},le="${le}"} ${d.buckets[i]}`));
      lines.push(`http_request_duration_seconds_bucket{${base},le="+Inf"} ${d.count}`);
      lines.push(`http_request_duration_seconds_sum{${base}} ${String(d.sum)}`);
      lines.push(`http_request_duration_seconds_count{${base}} ${d.count}`);
    }
    return lines.join('\n') + '\n';
  }

  /* ------------------------------------------------------------- health */

  function runCheck({ check }) {
    const controller = new AbortController();
    return new Promise((resolve) => {
      let done = false;
      const finish = (outcome) => {
        if (done) return;
        done = true;
        timers.clearTimeout(timer);
        resolve(outcome);
      };
      const timer = timers.setTimeout(() => {
        finish({ status: 'fail', error: 'timeout' });
        controller.abort(new Error('timeout'));
      }, checkTimeoutMs);
      new Promise((r) => r(check(controller.signal))).then(
        () => finish({ status: 'ok' }),
        (e) => finish({ status: 'fail', error: e instanceof Error ? e.message : String(e) }),
      );
    });
  }

  async function readiness(res) {
    if (draining) return sendJson(res, 503, { status: 'draining' });
    const outcomes = await Promise.all(checks.map(runCheck));
    const body = { status: 'ok', checks: {} };
    checks.forEach((c, i) => {
      body.checks[c.name] = outcomes[i];
      if (outcomes[i].status === 'fail') {
        if (c.critical ?? true) body.status = 'fail';
        else if (body.status === 'ok') body.status = 'degraded';
      }
    });
    sendJson(res, body.status === 'fail' ? 503 : 200, body);
  }

  /* ------------------------------------------------------------ errors */

  function safeReport(event) {
    try {
      const p = report(event);
      if (p && typeof p.then === 'function') p.then(undefined, () => {});
    } catch {
      // the tracker being down must not become our outage
    }
  }

  /* ----------------------------------------------------------- request */

  async function serve(req, res, pathname, start) {
    const incoming = parseTraceparent(req.headers['traceparent']);
    const ctx = incoming
      ? { traceId: incoming.traceId, spanId: ids.spanId(), sampled: (incoming.flags & 1) === 1 }
      : { traceId: ids.traceId(), spanId: ids.spanId(), sampled: true };
    res.setHeader('x-trace-id', ctx.traceId);

    const method = METHODS.has(req.method) ? req.method : 'other';
    let route = 'unmatched';
    let handler = null;
    for (const r of table) {
      if (r.method !== req.method) continue;
      const params = r.match(pathname);
      if (params) {
        route = r.path;
        handler = r.handler;
        req.params = params;
        break;
      }
    }

    res.on('finish', () => record(method, route, res.statusCode, (now() - start) / 1000));

    await trace.run(ctx, async () => {
      if (!handler) return sendJson(res, 404, { error: { code: 'NOT_FOUND' } });
      try {
        await handler(req, res);
      } catch (error) {
        const status = error?.status;
        if (Number.isInteger(status) && status >= 400 && status <= 499) {
          if (res.headersSent) return res.destroy();
          return sendJson(res, status, { error: { code: error.code ?? 'BAD_REQUEST', message: error.message } });
        }
        safeReport({
          name: error instanceof Error ? error.name : 'NonError',
          message: error instanceof Error ? error.message : String(error),
          method: req.method,
          route,
          traceId: ctx.traceId,
        });
        if (res.headersSent) return res.destroy();
        sendJson(res, 500, { error: { code: 'INTERNAL', message: 'internal error' } });
      }
    });
  }

  return {
    setDraining(value) {
      draining = Boolean(value);
    },

    outgoingHeaders() {
      const ctx = trace.getStore();
      if (!ctx) return {};
      return { traceparent: `00-${ctx.traceId}-${ctx.spanId}-${ctx.sampled ? '01' : '00'}` };
    },

    async handler(req, res) {
      const start = now();
      const { pathname } = new URL(req.url, 'http://x');
      if (req.method === 'GET') {
        if (pathname === '/livez') return sendJson(res, 200, { status: 'ok' });
        if (pathname === '/readyz') return readiness(res);
        if (pathname === '/metrics') {
          res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
          return res.end(exposition());
        }
      }
      return serve(req, res, pathname, start);
    },
  };
}
