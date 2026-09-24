import http from 'node:http';

export function createGracefulServer({ requestHandler, drainTimeoutMs = 5000 }) {
  let active = 0;
  let shuttingDown = false;
  let shutdownPromise = null;

  const server = http.createServer((req, res) => {
    // TODO: refuse when shutting down, otherwise count the request.
    // (This stub answers 501 so the tests fail fast instead of hanging.)
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  });

  return {
    server,
    get activeRequests() { return active; },
    get isShuttingDown() { return shuttingDown; },
    beginShutdown() {
      // TODO
    },
    shutdown() {
      // TODO: begin, close the listener, drain, or force after the timeout.
      // (The stub closes the listener so a test run does not hang on it.)
      server.close();
      throw new Error('shutdown() is not implemented yet');
    },
  };
}
