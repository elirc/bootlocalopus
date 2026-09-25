import http from 'node:http';

const VERSIONS = ['2023-01-01', '2023-06-01', '2024-01-01'];

/** A customers API that only knows the latest shape. It returns stored objects directly. */
function customersApi() {
  const store = new Map();
  const received = [];
  let next = 1;
  const handler = async (req, body) => {
    received.push(body);
    const [, , id] = req.url.split('/');
    if (req.method === 'POST') {
      const c = { id: 'cus_' + next++, ...body.data };
      store.set(c.id, c);
      return { status: 201, body: { data: c } };
    }
    if (req.method === 'GET' && !id) return { status: 200, body: { data: [...store.values()], hasMore: false } };
    const c = store.get(id);
    if (!c) return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'no customer' }, data: { balanceCents: 1 } } };
    if (req.method === 'PATCH') {
      Object.assign(c, body.data);
      return { status: 200, body: { data: c } };
    }
    return { status: 200, body: { data: c } };
  };
  return { handler, store, received };
}

async function start(handler, options = {}) {
  const server = http.createServer(solution.versioned(handler, { versions: VERSIONS, defaultVersion: '2023-01-01', ...options }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, path, { version, body, raw } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (version) headers['api-version'] = version;
    const res = await fetch(base + path, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    return { status: res.status, headers: res.headers, json: await res.json() };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

describe('the changes', () => {
  const byVersion = (v) => solution.CHANGES.find((c) => c.version === v);

  it('2023-06-01 converts dollars and cents, rounding float error', () => {
    const c = byVersion('2023-06-01');
    expect(c.up({ id: 'x', balance: 0.29 })).toStrictEqual({ id: 'x', balanceCents: 29 });
    expect(c.up({ balance: 12.34 })).toStrictEqual({ balanceCents: 1234 });
    expect(c.down({ id: 'x', balanceCents: 1234 })).toStrictEqual({ id: 'x', balance: 12.34 });
    expect(c.down({ balanceCents: 0 })).toStrictEqual({ balance: 0 });
  });

  it('2024-01-01 splits at the first space and joins without a trailing space', () => {
    const c = byVersion('2024-01-01');
    expect(c.up({ name: 'Grace Brewster Hopper', x: 1 })).toStrictEqual({ x: 1, firstName: 'Grace', lastName: 'Brewster Hopper' });
    expect(c.up({ name: 'Cher' })).toStrictEqual({ firstName: 'Cher', lastName: '' });
    expect(c.down({ firstName: 'Ada', lastName: 'Lovelace', id: 1 })).toStrictEqual({ id: 1, name: 'Ada Lovelace' });
    expect(c.down({ firstName: 'Cher', lastName: '' })).toStrictEqual({ name: 'Cher' });
  });

  it('leave partial resources alone and never mutate', () => {
    for (const c of solution.CHANGES) {
      const input = Object.freeze({ id: 'cus_1', other: true });
      expect(c.up(input)).toStrictEqual({ id: 'cus_1', other: true });
      expect(c.down(input)).toStrictEqual({ id: 'cus_1', other: true });
    }
    const frozen = Object.freeze({ name: 'Ada Lovelace', balance: 1 });
    expect(() => solution.CHANGES.forEach((c) => c.up(frozen))).not.toThrow();
  });
});

describe('versioned', () => {
  it('upgrades an old request and downgrades the response', async () => {
    const api = customersApi();
    const app = await start(api.handler);
    try {
      const res = await app.call('POST', '/customers', { version: '2023-01-01', body: { data: { name: 'Ada Lovelace', balance: 0.29 } } });
      expect(api.received[0]).toStrictEqual({ data: { firstName: 'Ada', lastName: 'Lovelace', balanceCents: 29 } });
      expect(res.status).toBe(201);
      expect(res.json).toStrictEqual({ data: { id: 'cus_1', name: 'Ada Lovelace', balance: 0.29 } });
      expect(res.headers.get('api-version')).toBe('2023-01-01');
      expect(res.headers.get('content-type')).toMatch(/application\/json/);
    } finally { await app.close(); }
  });

  it('gives each version its own shape of the same record', async () => {
    const api = customersApi();
    const app = await start(api.handler);
    try {
      await app.call('POST', '/customers', { version: '2024-01-01', body: { data: { firstName: 'Cher', lastName: '', balanceCents: 500 } } });
      expect((await app.call('GET', '/customers/cus_1', { version: '2024-01-01' })).json)
        .toStrictEqual({ data: { id: 'cus_1', firstName: 'Cher', lastName: '', balanceCents: 500 } });
      expect((await app.call('GET', '/customers/cus_1', { version: '2023-06-01' })).json)
        .toStrictEqual({ data: { id: 'cus_1', balanceCents: 500, name: 'Cher' } });
      expect((await app.call('GET', '/customers/cus_1', { version: '2023-01-01' })).json)
        .toStrictEqual({ data: { id: 'cus_1', balance: 5, name: 'Cher' } });
    } finally { await app.close(); }
  });

  it('uses the default version when the header is absent', async () => {
    const api = customersApi();
    const app = await start(api.handler);
    try {
      const res = await app.call('POST', '/customers', { body: { data: { name: 'Alan Turing', balance: 1 } } });
      expect(res.json.data).toStrictEqual({ id: 'cus_1', name: 'Alan Turing', balance: 1 });
      expect(res.headers.get('api-version')).toBe('2023-01-01');
    } finally { await app.close(); }
  });

  it('downgrades every element of a list and keeps the envelope', async () => {
    const api = customersApi();
    const app = await start(api.handler);
    try {
      await app.call('POST', '/customers', { version: '2024-01-01', body: { data: { firstName: 'A', lastName: 'B', balanceCents: 100 } } });
      await app.call('POST', '/customers', { version: '2024-01-01', body: { data: { firstName: 'C', lastName: 'D', balanceCents: 250 } } });
      const res = await app.call('GET', '/customers', { version: '2023-01-01' });
      expect(res.json).toStrictEqual({
        data: [{ id: 'cus_1', name: 'A B', balance: 1 }, { id: 'cus_2', name: 'C D', balance: 2.5 }],
        hasMore: false,
      });
    } finally { await app.close(); }
  });

  it('never mutates the objects the handler returns', async () => {
    const api = customersApi();
    const app = await start(api.handler);
    try {
      await app.call('POST', '/customers', { version: '2024-01-01', body: { data: { firstName: 'Ada', lastName: 'L', balanceCents: 7 } } });
      await app.call('GET', '/customers/cus_1', { version: '2023-01-01' });
      await app.call('GET', '/customers', { version: '2023-01-01' });
      expect(api.store.get('cus_1')).toStrictEqual({ id: 'cus_1', firstName: 'Ada', lastName: 'L', balanceCents: 7 });
    } finally { await app.close(); }
  });

  it('upgrades a partial PATCH without inventing fields', async () => {
    const api = customersApi();
    const app = await start(api.handler);
    try {
      await app.call('POST', '/customers', { version: '2024-01-01', body: { data: { firstName: 'Ada', lastName: 'L', balanceCents: 7 } } });
      const res = await app.call('PATCH', '/customers/cus_1', { version: '2023-01-01', body: { data: { name: 'Ada Lovelace' } } });
      expect(api.received[1]).toStrictEqual({ data: { firstName: 'Ada', lastName: 'Lovelace' } });
      expect(res.json.data).toStrictEqual({ id: 'cus_1', balance: 0.07, name: 'Ada Lovelace' });
    } finally { await app.close(); }
  });

  it('passes error bodies through untouched', async () => {
    const api = customersApi();
    const app = await start(api.handler);
    try {
      const res = await app.call('GET', '/customers/nope', { version: '2023-01-01' });
      expect(res.status).toBe(404);
      expect(res.json).toStrictEqual({ error: { code: 'NOT_FOUND', message: 'no customer' }, data: { balanceCents: 1 } });
    } finally { await app.close(); }
  });

  it('rejects an unsupported version with the supported list', async () => {
    const api = customersApi();
    const app = await start(api.handler);
    try {
      for (const v of ['2022-12-31', '2023-03-15', 'latest']) {
        const res = await app.call('GET', '/customers', { version: v });
        expect(res.status).toBe(400);
        expect(res.json.error.code).toBe('UNSUPPORTED_API_VERSION');
        expect(res.json.error.details).toStrictEqual({ supported: VERSIONS });
      }
      expect(api.received).toHaveLength(0);
    } finally { await app.close(); }
  });

  it('rejects malformed JSON with 400 INVALID_JSON', async () => {
    const api = customersApi();
    const app = await start(api.handler);
    try {
      const res = await app.call('POST', '/customers', { version: '2024-01-01', raw: '{"data":' });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('INVALID_JSON');
      expect(api.received).toHaveLength(0);
    } finally { await app.close(); }
  });

  it('applies changes in version order whatever order they are given in', async () => {
    // v1 said `a`, v2 renamed it `b`, v3 renamed that `c`. The handler speaks `c`.
    const rename = (from, to) => (r) => {
      if (!(from in r)) return r;
      const { [from]: value, ...rest } = r;
      return { ...rest, [to]: value };
    };
    const changes = [
      { version: '3', up: rename('b', 'c'), down: rename('c', 'b') },
      { version: '2', up: rename('a', 'b'), down: rename('b', 'a') },
    ];
    const seen = [];
    const handler = async (req, body) => {
      seen.push(body);
      return { status: 200, body: { data: { c: body.data.c + 1 } } };
    };
    const app = await start(handler, { versions: ['1', '2', '3'], changes, defaultVersion: '3' });
    try {
      expect((await app.call('POST', '/', { version: '1', body: { data: { a: 1 } } })).json).toStrictEqual({ data: { a: 2 } });
      expect((await app.call('POST', '/', { version: '2', body: { data: { b: 1 } } })).json).toStrictEqual({ data: { b: 2 } });
      expect((await app.call('POST', '/', { body: { data: { c: 1 } } })).json).toStrictEqual({ data: { c: 2 } });
      expect(seen.map((b) => b.data)).toStrictEqual([{ c: 1 }, { c: 1 }, { c: 1 }]);
    } finally { await app.close(); }
  });
});
