export function createApp(routes, { now = () => performance.now() } = {}) {
  const counts = new Map();

  // TODO: match route templates, bounded labels, a duration histogram timed
  // to 'finish', an in-flight gauge, 404/500 handling, and GET /metrics.
  // This version labels by raw URL: one series per user id.
  return async (req, res) => {
    if (req.url === '/metrics') {
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
      return res.end([...counts].map(([k, v]) => `http_requests_total{${k}} ${v}`).join('\n') + '\n');
    }
    const route = routes.find((r) => r.method === req.method && r.path === req.url);
    const key = `method="${req.method}",path="${req.url}"`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!route) {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end('{"error":{"code":"NOT_FOUND"}}');
    }
    try {
      await route.handler(req, res);
    } catch {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":{"code":"INTERNAL"}}');
    }
  };
}
