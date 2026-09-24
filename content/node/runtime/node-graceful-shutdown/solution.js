import http from 'node:http';

export function createGracefulServer({ requestHandler, drainTimeoutMs = 5000 }) {
  let active = 0;
  let shuttingDown = false;
  let shutdownPromise = null;

  const server = http.createServer((req, res) => {
    if (shuttingDown) {
      res.writeHead(503, { 'content-type': 'application/json', connection: 'close' });
      res.end(JSON.stringify({ error: 'server is shutting down' }));
      return;
    }

    active++;
    // 'close' fires on completion *and* on client disconnect; 'finish' misses the latter.
    res.on('close', () => { active--; });

    requestHandler(req, res);
  });

  const waitForDrain = () => new Promise((resolve) => {
    if (active === 0) return resolve();
    const interval = setInterval(() => {
      if (active === 0) {
        clearInterval(interval);
        resolve();
      }
    }, 10);
  });

  return {
    server,
    get activeRequests() { return active; },
    get isShuttingDown() { return shuttingDown; },

    beginShutdown() {
      // Phase one: still listening, but answering 503 so the balancer can react.
      shuttingDown = true;
    },

    shutdown() {
      if (shutdownPromise) return shutdownPromise;
      shuttingDown = true;

      shutdownPromise = (async () => {
        const closed = new Promise((resolve) => server.close(() => resolve()));
        // Idle keep-alive sockets would otherwise hold close() open for their
        // full timeout, turning a clean shutdown into a forced one.
        server.closeIdleConnections?.();

        let timer;
        const timedOut = new Promise((resolve) => {
          timer = setTimeout(() => resolve('forced'), drainTimeoutMs);
        });

        const outcome = await Promise.race([
          Promise.all([closed, waitForDrain()]).then(() => 'drained'),
          timedOut,
        ]);
        clearTimeout(timer);

        if (outcome === 'forced') {
          server.closeAllConnections?.();
          return { ok: true, forced: true };
        }
        return { ok: true, forced: false };
      })();

      return shutdownPromise;
    },
  };
}
