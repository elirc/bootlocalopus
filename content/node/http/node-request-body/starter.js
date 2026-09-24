import http from 'node:http';

export async function readJson(req, { limit = 1024 } = {}) {
  // TODO
  throw new Error('readJson is not implemented yet');
}

export function createServer() {
  return http.createServer(async (req, res) => {
    // TODO: call readJson and translate its errors into responses.
    // (This stub answers 501 so the tests fail fast instead of hanging.)
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  });
}
