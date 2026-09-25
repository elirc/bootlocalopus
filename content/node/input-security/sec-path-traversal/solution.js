import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

/** True when `full` is strictly inside `root` (both absolute). */
const isInside = (root, full) => {
  const rel = path.relative(root, full);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
};

export function resolveSafe(root, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath); // once: "%252e" is a file named "%2e"
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const full = path.resolve(root, decoded);
  return isInside(root, full) ? full : null;
}

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export function createFileServer(root) {
  return http.createServer(async (req, res) => {
    try {
      const rawPath = req.url.split('?')[0];
      if (req.method !== 'GET' || !rawPath.startsWith('/files/')) return sendJson(res, 404, { error: 'not-found' });

      const full = resolveSafe(root, rawPath.slice('/files/'.length));
      if (!full) return sendJson(res, 400, { error: 'bad-path' });

      let stat;
      let real;
      try {
        stat = await fs.promises.stat(full);
        real = await fs.promises.realpath(full);
      } catch {
        return sendJson(res, 404, { error: 'not-found' });
      }
      // A symlink (or junction) inside the root can point anywhere.
      if (!stat.isFile() || !isInside(await fs.promises.realpath(root), real)) {
        return sendJson(res, 404, { error: 'not-found' });
      }

      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': stat.size,
        'x-content-type-options': 'nosniff',
      });
      await pipeline(fs.createReadStream(real), res);
    } catch {
      if (!res.headersSent) sendJson(res, 500, { error: 'internal' });
      else res.destroy();
    }
  });
}
