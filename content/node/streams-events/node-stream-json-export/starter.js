import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export function createExportHandler(getRows) {
  return async (req, res) => {
    // TODO: GET /export streams a JSON array of getRows() with backpressure,
    // closes the source when the client leaves, and never fakes a success.
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  };
}
