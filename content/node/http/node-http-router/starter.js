import http from 'node:http';

const USERS = [
  { id: '1', name: 'ada' },
  { id: '2', name: 'bob' },
];

export function createServer() {
  return http.createServer((req, res) => {
    // TODO: parse the path, route, respond with JSON.
    // (This stub answers 501 so the tests fail fast instead of hanging.)
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  });
}
