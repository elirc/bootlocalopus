export function createShedder({ maxInFlight, criticalReserve = 0, retryAfterSec = 1, exempt = ['/healthz'] }) {
  let inFlight = 0;

  const wrap = (handler) => async (req, res) => {
    // Accepts everything. TODO: shed with 503 past the limit, keep a
    // critical reserve, exempt health checks, and count down on 'close'
    // (a client that hangs up is gone even if the handler is still running).
    inFlight++;
    try {
      await handler(req, res);
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal' }));
      }
    } finally {
      inFlight--;
    }
  };

  return {
    wrap,
    stats: () => ({ inFlight, shed: 0 }),
  };
}
