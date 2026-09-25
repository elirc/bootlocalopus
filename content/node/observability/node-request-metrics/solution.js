const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const BUCKETS = [0.05, 0.1, 0.25, 0.5, 1];

const label = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

/** Compile '/users/:id' into a matcher returning params or null. */
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

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createApp(routes, { now = () => performance.now() } = {}) {
  const table = routes.map((r) => ({ ...r, match: compile(r.path) }));
  const requests = new Map();   // key -> { method, route, status, count }
  const durations = new Map();  // key -> { method, route, buckets[], sum, count }
  let inFlight = 0;

  function record(method, route, status, seconds) {
    const rKey = JSON.stringify([method, route, status]);
    const r = requests.get(rKey) ?? { method, route, status, count: 0 };
    r.count++;
    requests.set(rKey, r);

    const dKey = JSON.stringify([method, route]);
    const d = durations.get(dKey) ?? { method, route, buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
    BUCKETS.forEach((le, i) => { if (seconds <= le) d.buckets[i]++; });   // cumulative by construction
    d.sum += seconds;
    d.count++;
    durations.set(dKey, d);
  }

  function exposition() {
    const lines = ['# TYPE http_requests_total counter'];
    for (const r of requests.values()) {
      lines.push(`http_requests_total{method="${label(r.method)}",route="${label(r.route)}",status="${r.status}"} ${r.count}`);
    }
    lines.push('# TYPE http_request_duration_seconds histogram');
    for (const d of durations.values()) {
      const base = `method="${label(d.method)}",route="${label(d.route)}"`;
      BUCKETS.forEach((le, i) => lines.push(`http_request_duration_seconds_bucket{${base},le="${le}"} ${d.buckets[i]}`));
      lines.push(`http_request_duration_seconds_bucket{${base},le="+Inf"} ${d.count}`);
      lines.push(`http_request_duration_seconds_sum{${base}} ${String(d.sum)}`);
      lines.push(`http_request_duration_seconds_count{${base}} ${d.count}`);
    }
    lines.push('# TYPE http_requests_in_flight gauge', `http_requests_in_flight ${inFlight}`);
    return lines.join('\n') + '\n';
  }

  return async (req, res) => {
    const start = now();
    const { pathname } = new URL(req.url, 'http://x');

    if (req.method === 'GET' && pathname === '/metrics') {
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
      return res.end(exposition());
    }

    // Bounded labels only: the template, never the raw path; a known method or 'other'.
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

    inFlight++;
    res.on('finish', () => {
      inFlight--;
      record(method, route, res.statusCode, (now() - start) / 1000);
    });

    if (!handler) return sendJson(res, 404, { error: { code: 'NOT_FOUND' } });
    try {
      await handler(req, res);
    } catch {
      if (!res.headersSent) sendJson(res, 500, { error: { code: 'INTERNAL' } });
      else res.destroy();
    }
  };
}
