import http from 'node:http';
import crypto from 'node:crypto';

const send = (res, status, body, headers = {}) => {
  if (body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

export function createAuthApp({
  users,
  permissions = {},
  now = Date.now,
  idleMs = 1_800_000,
  absoluteMs = 43_200_000,
  sudoMs = 300_000,
  maxFailures = 5,
  lockMs = 900_000,
}) {
  // TODO: sessions, lockout, and the five routes from the brief.
  const server = http.createServer((req, res) => {
    send(res, 501, { error: 'not implemented' });
  });

  return { server };
}
