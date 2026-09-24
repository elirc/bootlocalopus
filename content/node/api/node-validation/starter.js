import http from 'node:http';

const SORTS = ['createdAt', 'name', 'score'];

export function parsePagination(searchParams) {
  // TODO: parse, validate, collect every failure
}

export function createServer() {
  return http.createServer((req, res) => {
    // TODO
    // (This stub answers 501 so the tests fail fast instead of hanging.)
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  });
}
