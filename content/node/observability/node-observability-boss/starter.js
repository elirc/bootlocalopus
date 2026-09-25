export function createService({
  routes,
  checks = [],
  checkTimeoutMs = 1000,
  report = () => {},
  now = () => performance.now(),
  ids,
  timers = { setTimeout, clearTimeout },
}) {
  // TODO: /livez, /readyz, /metrics; traceparent + AsyncLocalStorage;
  // route templates; client vs server errors; metrics recorded on 'finish'.
  return {
    setDraining(value) {},
    outgoingHeaders() {
      return {};
    },
    async handler(req, res) {
      res.writeHead(501, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'NOT_IMPLEMENTED' } }));
    },
  };
}
