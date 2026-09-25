import { createHash } from 'node:crypto';

export function createDocHandler(store, { now = Date.now } = {}) {
  return (req, res) => {
    // TODO: serve /docs/<id> with Last-Modified and ETag, and answer 304 by
    // the RFC's rules (If-None-Match first, second-precision dates).
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  };
}
