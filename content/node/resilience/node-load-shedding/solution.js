const sendJson = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

export function createShedder({ maxInFlight, criticalReserve = 0, retryAfterSec = 1, exempt = ['/healthz'] }) {
  let inFlight = 0;
  let shed = 0;

  const admit = (critical) => inFlight < (critical ? maxInFlight : maxInFlight - criticalReserve);

  const wrap = (handler) => async (req, res) => {
    const pathname = req.url.split('?')[0];
    // Never shed health checks: a shed /healthz turns overload into "instance dead".
    if (exempt.includes(pathname)) return handler(req, res);

    if (!admit(req.headers['x-priority'] === 'critical')) {
      shed++;
      // Decided before touching the body or any dependency: shedding must be cheap.
      return sendJson(res, 503, { error: 'overloaded' }, { 'retry-after': String(retryAfterSec) });
    }

    inFlight++;
    let released = false;
    // 'close' fires after a normal finish and after a client disconnect alike.
    res.once('close', () => {
      if (released) return;
      released = true;
      inFlight--;
    });

    try {
      await handler(req, res);
    } catch {
      if (!res.headersSent) sendJson(res, 500, { error: 'internal' });
      else res.destroy();
    }
  };

  return {
    wrap,
    stats: () => ({ inFlight, shed }),
  };
}
