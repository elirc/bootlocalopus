import http from 'node:http';
import crypto from 'node:crypto';

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export function createAttachmentsApp({ authenticate, maxBytes = 5_242_880, quotaBytes = 20_971_520, maxInFlight = 2 }) {
  const files = new Map();

  // TODO: routing, auth, the upload checks in order, per-user slots and
  // quota with reservations, safe downloads.
  const server = http.createServer((req, res) => {
    sendJson(res, 501, { error: 'not implemented' });
  });

  return { server };
}
