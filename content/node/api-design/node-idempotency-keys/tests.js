import http from 'node:http';

/** A payments handler that counts its calls. `gate` (optional) holds the first call until it resolves. */
function payments({ gate, status = 201, throws = false } = {}) {
  const calls = [];
  const handler = async (req, rawBody) => {
    calls.push({ method: req.method, url: req.url, rawBody });
    if (gate && calls.length === 1) await gate;
    if (throws) throw new Error('db down');
    return { status, body: { id: 'pay_' + calls.length, echo: rawBody } };
  };
  return { handler, calls };
}

async function start(handler, options) {
  const server = http.createServer(solution.withIdempotency(handler, options));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (method, path, { key, body } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (key !== undefined) headers['idempotency-key'] = key;
    const res = await fetch(base + path, { method, headers, body });
    return { status: res.status, headers: res.headers, json: await res.json() };
  };
  return { request, close: () => new Promise((r) => server.close(r)) };
}

const until = async (cond) => {
  for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
  if (!cond()) fail('condition never became true');
};

describe('pass-through', () => {
  it('runs the handler for every request without a key, and for non-POST', async () => {
    const { handler, calls } = payments();
    const app = await start(handler);
    try {
      const a = await app.request('POST', '/payments', { body: '{"cents":100}' });
      const b = await app.request('POST', '/payments', { body: '{"cents":100}' });
      expect(a.status).toBe(201);
      expect(a.json).toEqual({ id: 'pay_1', echo: '{"cents":100}' });
      expect(b.json.id).toBe('pay_2');
      expect(a.headers.get('content-type')).toMatch(/application\/json/);
      await app.request('PUT', '/payments/1', { key: 'k1', body: '{}' });
      await app.request('PUT', '/payments/1', { key: 'k1', body: '{}' });
      expect(calls).toHaveLength(4);
    } finally { await app.close(); }
  });
});

describe('replay', () => {
  it('runs the handler once and replays the stored response with a header', async () => {
    const { handler, calls } = payments();
    const app = await start(handler);
    try {
      const first = await app.request('POST', '/payments', { key: 'order-42', body: '{"cents":100}' });
      const again = await app.request('POST', '/payments', { key: 'order-42', body: '{"cents":100}' });
      expect(calls).toHaveLength(1);
      expect(first.status).toBe(201);
      expect(first.headers.get('idempotent-replayed')).toBeNull();
      expect(again.status).toBe(201);
      expect(again.json).toEqual(first.json);
      expect(again.headers.get('idempotent-replayed')).toBe('true');
      expect(again.headers.get('content-type')).toMatch(/application\/json/);
    } finally { await app.close(); }
  });

  it('keeps different keys apart', async () => {
    const { handler, calls } = payments();
    const app = await start(handler);
    try {
      const a = await app.request('POST', '/payments', { key: 'a', body: '{}' });
      const b = await app.request('POST', '/payments', { key: 'b', body: '{}' });
      expect(calls).toHaveLength(2);
      expect(a.json.id).not.toBe(b.json.id);
    } finally { await app.close(); }
  });

  it('stores 4xx responses too: they are real answers', async () => {
    const { handler, calls } = payments({ status: 402 });
    const app = await start(handler);
    try {
      await app.request('POST', '/payments', { key: 'declined', body: '{}' });
      const again = await app.request('POST', '/payments', { key: 'declined', body: '{}' });
      expect(calls).toHaveLength(1);
      expect(again.status).toBe(402);
      expect(again.headers.get('idempotent-replayed')).toBe('true');
    } finally { await app.close(); }
  });
});

describe('invalid keys', () => {
  it('rejects a malformed key with 400 before calling the handler', async () => {
    const { handler, calls } = payments();
    const app = await start(handler);
    try {
      for (const bad of ['', 'has space', 'x'.repeat(65), 'semi;colon']) {
        const res = await app.request('POST', '/payments', { key: bad, body: '{}' });
        expect(res.status).toBe(400);
        expect(res.json.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
        expect(typeof res.json.error.message).toBe('string');
      }
      expect(calls).toHaveLength(0);
      const ok = await app.request('POST', '/payments', { key: 'A_z-9'.padEnd(64, 'x'), body: '{}' });
      expect(ok.status).toBe(201);
    } finally { await app.close(); }
  });
});

describe('reuse', () => {
  it('refuses the same key with a different body or path', async () => {
    const { handler, calls } = payments();
    const app = await start(handler);
    try {
      await app.request('POST', '/payments', { key: 'k', body: '{"cents":100}' });
      const otherBody = await app.request('POST', '/payments', { key: 'k', body: '{"cents":999}' });
      expect(otherBody.status).toBe(422);
      expect(otherBody.json.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      const otherPath = await app.request('POST', '/refunds', { key: 'k', body: '{"cents":100}' });
      expect(otherPath.status).toBe(422);
      expect(calls).toHaveLength(1);
      const original = await app.request('POST', '/payments', { key: 'k', body: '{"cents":100}' });
      expect(original.status).toBe(201);
      expect(original.headers.get('idempotent-replayed')).toBe('true');
    } finally { await app.close(); }
  });
});

describe('concurrency', () => {
  it('answers 409 to a duplicate while the first is still running, then replays', async () => {
    let open;
    const gate = new Promise((r) => { open = r; });
    const { handler, calls } = payments({ gate });
    const app = await start(handler);
    try {
      const first = app.request('POST', '/payments', { key: 'dup', body: '{"cents":5}' });
      await until(() => calls.length === 1);
      const second = await app.request('POST', '/payments', { key: 'dup', body: '{"cents":5}' });
      expect(second.status).toBe(409);
      expect(second.json.error.code).toBe('IDEMPOTENCY_KEY_IN_USE');
      expect(second.headers.get('retry-after')).toBe('1');
      const reused = await app.request('POST', '/payments', { key: 'dup', body: '{"cents":6}' });
      expect(reused.status).toBe(422);
      open();
      expect((await first).status).toBe(201);
      const third = await app.request('POST', '/payments', { key: 'dup', body: '{"cents":5}' });
      expect(third.status).toBe(201);
      expect(third.headers.get('idempotent-replayed')).toBe('true');
      expect(calls).toHaveLength(1);
    } finally { open(); await app.close(); }
  });

  it('lets only one of two simultaneous first requests through', async () => {
    let open;
    const gate = new Promise((r) => { open = r; });
    const { handler, calls } = payments({ gate });
    const app = await start(handler);
    try {
      const both = Promise.all([
        app.request('POST', '/payments', { key: 'race', body: '{}' }),
        app.request('POST', '/payments', { key: 'race', body: '{}' }),
      ]);
      await until(() => calls.length >= 1);
      await new Promise((r) => setTimeout(r, 30));
      open();
      const statuses = (await both).map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);
      expect(calls).toHaveLength(1);
    } finally { open(); await app.close(); }
  });
});

describe('failures', () => {
  it('forgets a 5xx so the client can retry with the same key', async () => {
    let status = 503;
    const calls = [];
    const handler = async () => { calls.push(1); return { status, body: { n: calls.length } }; };
    const app = await start(handler);
    try {
      expect((await app.request('POST', '/payments', { key: 'r', body: '{}' })).status).toBe(503);
      status = 201;
      const retry = await app.request('POST', '/payments', { key: 'r', body: '{}' });
      expect(retry.status).toBe(201);
      expect(retry.headers.get('idempotent-replayed')).toBeNull();
      expect(calls).toHaveLength(2);
    } finally { await app.close(); }
  });

  it('answers a throw with a 500 envelope and forgets the key', async () => {
    let throws = true;
    const calls = [];
    const handler = async () => {
      calls.push(1);
      if (throws) throw new Error('connection refused to db-primary');
      return { status: 201, body: { ok: true } };
    };
    const app = await start(handler);
    try {
      const res = await app.request('POST', '/payments', { key: 't', body: '{}' });
      expect(res.status).toBe(500);
      expect(res.json.error.code).toBe('INTERNAL');
      expect(JSON.stringify(res.json)).not.toContain('db-primary');
      throws = false;
      const retry = await app.request('POST', '/payments', { key: 't', body: '{}' });
      expect(retry.status).toBe(201);
      expect(calls).toHaveLength(2);
    } finally { await app.close(); }
  });
});

describe('expiry', () => {
  it('forgets a stored response after ttlMs', async () => {
    let clock = 1_000_000;
    const { handler, calls } = payments();
    const app = await start(handler, { now: () => clock, ttlMs: 1000 });
    try {
      await app.request('POST', '/payments', { key: 'old', body: '{}' });
      clock += 999;
      const replay = await app.request('POST', '/payments', { key: 'old', body: '{}' });
      expect(replay.headers.get('idempotent-replayed')).toBe('true');
      clock += 1;
      const fresh = await app.request('POST', '/payments', { key: 'old', body: '{"new":1}' });
      expect(fresh.status).toBe(201);
      expect(fresh.headers.get('idempotent-replayed')).toBeNull();
      expect(calls).toHaveLength(2);
    } finally { await app.close(); }
  });
});
