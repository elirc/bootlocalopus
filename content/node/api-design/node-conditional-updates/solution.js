const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

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

const fail = (res, status, code, message, headers) => send(res, status, { error: { code, message } }, headers);

const etagOf = (doc) => `"${doc.version}"`;

/** `*` or a list of entity tags. Returns true if any tag matches `etag`. */
function matches(header, etag, { weak }) {
  const tags = header.split(',').map((t) => t.trim()).filter(Boolean);
  if (tags.includes('*')) return true;
  return tags.some((tag) => {
    if (tag.startsWith('W/')) return weak && tag.slice(2) === etag;
    return tag === etag;
  });
}

export function createDocsApi(store) {
  return async (req, res) => {
    const match = /^\/docs\/([^/]+)$/.exec(new URL(req.url, 'http://x').pathname);
    if (!match) return fail(res, 404, 'NOT_FOUND', 'no such route');
    const id = decodeURIComponent(match[1]);

    if (req.method === 'GET') {
      const doc = store.get(id);
      if (!doc) return fail(res, 404, 'NOT_FOUND', `no document "${id}"`);
      const etag = etagOf(doc);
      const inm = req.headers['if-none-match'];
      if (inm !== undefined && matches(inm, etag, { weak: true })) {
        res.writeHead(304, { etag });
        return res.end();
      }
      return send(res, 200, { data: doc.data }, { etag });
    }

    if (req.method === 'PUT') {
      // Await everything first. From here to store.set there is no await, so
      // no other request can change the version between our check and write.
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        body = undefined;
      }
      if (!isPlainObject(body) || !isPlainObject(body.data)) {
        return fail(res, 400, 'INVALID_BODY', 'send { "data": { ... } }');
      }

      const doc = store.get(id);
      if (!doc) return fail(res, 404, 'NOT_FOUND', `no document "${id}"`);
      const ifMatch = req.headers['if-match'];
      if (ifMatch === undefined) {
        return fail(res, 428, 'PRECONDITION_REQUIRED', 'send If-Match with the ETag you read');
      }
      if (!matches(ifMatch, etagOf(doc), { weak: false })) {
        return fail(res, 412, 'PRECONDITION_FAILED', 'the document changed since you read it', { etag: etagOf(doc) });
      }

      const next = { version: doc.version + 1, data: body.data };
      store.set(id, next);
      return send(res, 200, { data: next.data }, { etag: etagOf(next) });
    }

    fail(res, 405, 'METHOD_NOT_ALLOWED', `${req.method} is not supported`, { allow: 'GET, PUT' });
  };
}
