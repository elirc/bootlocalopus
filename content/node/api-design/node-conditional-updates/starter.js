function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

export function createDocsApi(store) {
  return async (req, res) => {
    // TODO: ETags on GET (with If-None-Match), and PUT guarded by If-Match
    // (428 when missing, 412 when stale). This version lets the last write win.
    const id = req.url.split('/').pop();
    const doc = store.get(id);
    if (!doc) return send(res, 404, { error: { code: 'NOT_FOUND', message: 'no document' } });
    if (req.method === 'PUT') {
      let body = {};
      try { body = JSON.parse(await readBody(req)); } catch {}
      store.set(id, { version: doc.version + 1, data: body.data });
      return send(res, 200, { data: body.data });
    }
    send(res, 200, { data: doc.data });
  };
}
