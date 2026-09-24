import http from 'node:http';

export function createApi({ token = 'secret-token', now = () => new Date('2024-01-01') } = {}) {
  const notes = new Map();
  let nextId = 1;

  // TODO: build it. Suggested order:
  //   1. send() and the error envelope
  //   2. readJson()
  //   3. validate() for create and patch
  //   4. auth check
  //   5. the router
  const server = http.createServer(async (req, res) => {
    // (This stub answers 501 so the tests fail fast instead of hanging.)
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  });

  return { server };
}
