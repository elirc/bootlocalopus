function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createHealth({
  checks,
  timeoutMs = 1000,
  cacheMs = 1000,
  now = Date.now,
  timers = { setTimeout, clearTimeout },
}) {
  // TODO: /livez without dependency checks; /readyz with parallel checks,
  // per-check timeouts, critical vs non-critical, draining, and shared,
  // cached evaluations.
  return {
    setDraining(value) {},
    async handler(req, res) {
      send(res, 501, { status: 'not implemented' });
    },
  };
}
