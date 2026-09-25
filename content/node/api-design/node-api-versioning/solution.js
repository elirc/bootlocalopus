const without = (object, ...keys) => {
  const copy = { ...object };
  for (const key of keys) delete copy[key];
  return copy;
};

export const CHANGES = [
  {
    version: '2023-06-01',
    up(resource) {
      if (!('balance' in resource)) return resource;
      return { ...without(resource, 'balance'), balanceCents: Math.round(resource.balance * 100) };
    },
    down(resource) {
      if (!('balanceCents' in resource)) return resource;
      return { ...without(resource, 'balanceCents'), balance: resource.balanceCents / 100 };
    },
  },
  {
    version: '2024-01-01',
    up(resource) {
      if (!('name' in resource)) return resource;
      const space = resource.name.indexOf(' ');
      const firstName = space === -1 ? resource.name : resource.name.slice(0, space);
      const lastName = space === -1 ? '' : resource.name.slice(space + 1);
      return { ...without(resource, 'name'), firstName, lastName };
    },
    down(resource) {
      if (!('firstName' in resource) && !('lastName' in resource)) return resource;
      const name = [resource.firstName ?? '', resource.lastName ?? ''].filter(Boolean).join(' ');
      return { ...without(resource, 'firstName', 'lastName'), name };
    },
  },
];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

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

export function versioned(handler, { versions, changes = CHANGES, defaultVersion }) {
  // Sort once, oldest first; never trust the caller's order.
  const ordered = [...changes].sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));

  return async (req, res) => {
    const version = req.headers['api-version'] ?? defaultVersion;
    if (!versions.includes(version)) {
      return send(res, 400, {
        error: { code: 'UNSUPPORTED_API_VERSION', message: `unsupported api-version "${version}"`, details: { supported: versions } },
      });
    }

    // Every change newer than the client's version stands between it and the handler.
    const pending = ordered.filter((c) => c.version > version);

    const raw = await readBody(req);
    let body;
    if (raw !== '') {
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: { code: 'INVALID_JSON', message: 'request body is not valid JSON' } }, { 'api-version': version });
      }
    }
    if (isObject(body) && isObject(body.data)) {
      body = { ...body, data: pending.reduce((data, change) => change.up(data), body.data) };
    }

    const result = await handler(req, body);
    let out = result.body;
    if (result.status >= 200 && result.status < 300 && isObject(out) && (isObject(out.data) || Array.isArray(out.data))) {
      // Newest first on the way out. Each step returns a new object.
      const down = (resource) => pending.reduceRight((r, change) => change.down(r), resource);
      out = { ...out, data: Array.isArray(out.data) ? out.data.map(down) : down(out.data) };
    }
    send(res, result.status, out, { 'api-version': version });
  };
}
