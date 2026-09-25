import http from 'node:http';

const emailOk = (item) =>
  item && typeof item.email === 'string' && /^[^@\s]+@[^@\s]+$/.test(item.email) ? null : 'email is invalid';

/**
 * A contacts service. By default `create` resolves on the next tick; with
 * `manual: true` every call waits for the test to settle it.
 */
function contacts({ manual = false, failOn = () => false } = {}) {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let n = 0;
  const create = (item) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const call = { item };
    calls.push(call);
    const p = new Promise((resolve, reject) => { call.resolve = resolve; call.reject = reject; });
    if (!manual) {
      setImmediate(() => {
        if (failOn(item)) call.reject(new Error('duplicate key value violates unique constraint "contacts_pkey" on db-7.internal'));
        else call.resolve({ id: 'c' + ++n, ...item });
      });
    }
    return p.finally(() => { inFlight--; });
  };
  return { create, calls, get maxInFlight() { return maxInFlight; } };
}

async function start(options) {
  const server = http.createServer(solution.createBulkHandler({ validate: emailOk, keyOf: (i) => i.email.toLowerCase(), ...options }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = async (body) => {
    const res = await fetch(base + '/contacts/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, json: await res.json() };
  };
  return { post, close: () => new Promise((r) => server.close(r)) };
}

const until = async (cond) => {
  for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
  if (!cond()) fail('condition never became true');
};

const items = (n) => Array.from({ length: n }, (_, i) => ({ email: `u${i}@x.io` }));

describe('happy path', () => {
  it('creates everything and answers 201 with per-item results and a summary', async () => {
    const svc = contacts();
    const app = await start({ create: svc.create });
    try {
      const r = await app.post({ items: [{ email: 'a@x.io' }, { email: 'b@x.io' }] });
      expect(r.status).toBe(201);
      expect(r.headers.get('content-type')).toMatch(/application\/json/);
      expect(r.json.results).toHaveLength(2);
      expect(r.json.results[0]).toStrictEqual({ index: 0, status: 201, data: { id: r.json.results[0].data.id, email: 'a@x.io' } });
      expect(r.json.results[1].index).toBe(1);
      expect(r.json.results[1].data.email).toBe('b@x.io');
      expect(r.json.summary).toStrictEqual({ total: 2, succeeded: 2, failed: 0 });
    } finally { await app.close(); }
  });
});

describe('partial success', () => {
  it('reports invalid items with 422 and still creates the rest (207)', async () => {
    const svc = contacts();
    const app = await start({ create: svc.create });
    try {
      const r = await app.post({ items: [{ email: 'a@x.io' }, { email: 'nope' }, { email: 'c@x.io' }, null] });
      expect(r.status).toBe(207);
      expect(r.json.results.map((x) => x.status)).toEqual([201, 422, 201, 422]);
      expect(r.json.results[1]).toStrictEqual({ index: 1, status: 422, error: { code: 'VALIDATION_FAILED', message: 'email is invalid' } });
      expect(svc.calls.map((c) => c.item.email)).toEqual(['a@x.io', 'c@x.io']);
      expect(r.json.summary).toStrictEqual({ total: 4, succeeded: 2, failed: 2 });
    } finally { await app.close(); }
  });

  it('rejects a duplicate of an earlier valid item, but not of an invalid one', async () => {
    const svc = contacts();
    const app = await start({ create: svc.create });
    try {
      const r = await app.post({ items: [
        { email: 'bad@', name: 'x' },
        { email: 'Ada@x.io' },
        { email: 'ada@x.io' },
        { email: 'bad@', name: 'y' },
      ] });
      expect(r.json.results.map((x) => x.status)).toEqual([422, 201, 409, 422]);
      expect(r.json.results[2].index).toBe(2);
      expect(r.json.results[2].error.code).toBe('DUPLICATE_IN_BATCH');
      expect(typeof r.json.results[2].error.message).toBe('string');
      expect(svc.calls).toHaveLength(1);

      const svc2 = contacts();
      const app2 = await start({ create: svc2.create, validate: (i) => (i.skip ? 'skipped' : null) });
      try {
        const r2 = await app2.post({ items: [{ email: 'k@x.io', skip: true }, { email: 'k@x.io' }] });
        expect(r2.json.results.map((x) => x.status)).toEqual([422, 201]);
      } finally { await app2.close(); }
    } finally { await app.close(); }
  });

  it('isolates a failing create and does not leak its message', async () => {
    const svc = contacts({ failOn: (i) => i.email === 'b@x.io' });
    const app = await start({ create: svc.create });
    try {
      const r = await app.post({ items: [{ email: 'a@x.io' }, { email: 'b@x.io' }, { email: 'c@x.io' }] });
      expect(r.status).toBe(207);
      expect(r.json.results[1]).toStrictEqual({ index: 1, status: 500, error: { code: 'INTERNAL', message: 'internal error' } });
      expect(r.json.results[0].status).toBe(201);
      expect(r.json.results[2].status).toBe(201);
      expect(JSON.stringify(r.json)).not.toMatch(/db-7|constraint/);
    } finally { await app.close(); }
  });

  it('answers 207 even when every item failed', async () => {
    const svc = contacts({ failOn: () => true });
    const app = await start({ create: svc.create });
    try {
      const r = await app.post({ items: [{ email: 'a@x.io' }, { email: 'nope' }] });
      expect(r.status).toBe(207);
      expect(r.json.summary).toStrictEqual({ total: 2, succeeded: 0, failed: 2 });
    } finally { await app.close(); }
  });

  it('treats a synchronous throw from create like a rejection', async () => {
    const create = (item) => { if (item.email === 'a@x.io') throw new Error('sync'); return Promise.resolve({ id: 1, ...item }); };
    const app = await start({ create });
    try {
      const r = await app.post({ items: [{ email: 'a@x.io' }, { email: 'b@x.io' }] });
      expect(r.status).toBe(207);
      expect(r.json.results.map((x) => x.status)).toEqual([500, 201]);
    } finally { await app.close(); }
  });
});

describe('concurrency and order', () => {
  it('runs at most `concurrency` creates at once, in index order, refilling as each settles', async () => {
    const svc = contacts({ manual: true });
    const app = await start({ create: svc.create, concurrency: 3 });
    try {
      const pending = app.post({ items: items(7) });
      await until(() => svc.calls.length === 3);
      await new Promise((r) => setTimeout(r, 30));
      expect(svc.calls.length).toBe(3);
      expect(svc.calls.map((c) => c.item.email)).toEqual(['u0@x.io', 'u1@x.io', 'u2@x.io']);

      svc.calls[1].resolve({ id: 'one' });
      await until(() => svc.calls.length === 4);
      expect(svc.calls[3].item.email).toBe('u3@x.io');

      // Always settle the most recently started call, so they finish out of order.
      const done = new Set([1]);
      while (done.size < 7) {
        await until(() => svc.calls.length === Math.min(7, 3 + done.size));
        const i = [...svc.calls.keys()].reverse().find((k) => !done.has(k));
        done.add(i);
        svc.calls[i].resolve({ id: 'r' + i });
      }
      const r = await pending;
      expect(svc.maxInFlight).toBe(3);
      expect(r.status).toBe(201);
      expect(r.json.results.map((x) => x.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(r.json.results[1].data).toStrictEqual({ id: 'one' });
      expect(r.json.results[6].data).toStrictEqual({ id: 'r6' });
    } finally { await app.close(); }
  });

  it('defaults to 4 in flight and actually runs them in parallel', async () => {
    const svc = contacts();
    const app = await start({ create: svc.create });
    try {
      const r = await app.post({ items: items(10) });
      expect(r.status).toBe(201);
      expect(svc.maxInFlight).toBe(4);
    } finally { await app.close(); }
  });
});

describe('the envelope', () => {
  it('answers 400 INVALID_BODY for anything but a non-empty items array', async () => {
    const svc = contacts();
    const app = await start({ create: svc.create });
    try {
      for (const body of ['{"items":', '[]', 'null', '{"items":{}}', '{"items":[]}', '{}']) {
        const r = await app.post(body);
        expect(r.status).toBe(400);
        expect(r.json.error.code).toBe('INVALID_BODY');
      }
      expect(svc.calls).toHaveLength(0);
    } finally { await app.close(); }
  });

  it('refuses an oversized batch without creating anything', async () => {
    const svc = contacts();
    const app = await start({ create: svc.create, maxItems: 5 });
    try {
      const r = await app.post({ items: items(6) });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('BATCH_TOO_LARGE');
      expect(svc.calls).toHaveLength(0);
      expect((await app.post({ items: items(5) })).status).toBe(201);
    } finally { await app.close(); }
  });
});
