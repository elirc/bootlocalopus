import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export function createExportHandler(getRows) {
  return async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' || pathname !== '/export') {
      sendJson(res, 404, { error: 'not found' });
      return;
    }

    const rows = getRows()[Symbol.asyncIterator]();
    let first;
    try {
      first = await rows.next(); // nothing is sent until we know the source works
    } catch {
      sendJson(res, 500, { error: 'export failed' });
      return;
    }

    async function* body() {
      try {
        yield '[';
        if (!first.done) {
          yield JSON.stringify(first.value);
          for (;;) {
            const next = await rows.next();
            if (next.done) break;
            yield ',' + JSON.stringify(next.value);
          }
        }
        yield ']';
      } finally {
        // Runs on success, on a source error, and when pipeline tears us down
        // because the client left: the cursor is always closed.
        await rows.return?.();
      }
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    try {
      // pipeline waits for drain, and destroys both sides if either fails or closes early.
      await pipeline(Readable.from(body()), res);
    } catch {
      // Client gone or source failed mid-stream: the response is already destroyed.
    }
  };
}
