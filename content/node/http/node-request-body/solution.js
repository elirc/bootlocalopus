import http from 'node:http';

const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export async function readJson(req, { limit = 1024 } = {}) {
  // Cheapest possible rejection: the client told us how big it is. Doing this
  // before touching the stream is also what lets us still send a response.
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    throw httpError(413, 'payload too large');
  }

  const chunks = [];
  let size = 0;
  let tooLarge = false;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      // break (not throw) so the stream is closed properly and an endless
      // producer stops sending.
      tooLarge = true;
      break;
    }
    chunks.push(chunk);
  }
  if (tooLarge) throw httpError(413, 'payload too large');

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw httpError(400, 'invalid json');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw httpError(400, 'body must be an object');
  }
  return parsed;
}

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export function createServer() {
  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (req.method !== 'POST' || pathname !== '/echo') {
      return send(res, 404, { error: 'not found' });
    }
    try {
      const received = await readJson(req);
      send(res, 200, { received });
    } catch (error) {
      send(res, error.status ?? 500, { error: error.message });
    }
  });
}
