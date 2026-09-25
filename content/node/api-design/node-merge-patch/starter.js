export function applyMergePatch(target, patch) {
  // TODO: RFC 7396 — merge objects recursively, null deletes, anything else
  // replaces. This shallow version loses nested fields and stores nulls.
  return Object.assign(target, patch);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createPatchHandler({ load, save, readonly = [], validate = () => null }) {
  return async (req, res) => {
    // TODO: 415 / 400 / 404 / 422 checks, in the order the brief gives.
    await readBody(req);
    send(res, 501, { error: { code: 'NOT_IMPLEMENTED', message: 'todo' } });
  };
}
