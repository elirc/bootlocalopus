import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export function resolveSafe(root, requestPath) {
  // The version from the tutorial: fine until someone sends "..%2f".
  return path.join(root, requestPath.replaceAll('../', ''));
}

export function createFileServer(root) {
  return http.createServer((req, res) => {
    // TODO: route GET /files/<rest>, 400 / 404 / 200 as the brief says.
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  });
}
