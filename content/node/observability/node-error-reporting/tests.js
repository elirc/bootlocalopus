import http from 'node:http';

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

function setup(options = {}) {
  const clock = { t: Date.UTC(2025, 5, 1, 9, 0, 0) };
  const sent = [];
  const reporter = solution.createReporter({ transport: (e) => { sent.push(e); }, now: () => clock.t, ...options });
  return { reporter, sent, clock };
}

describe('events', () => {
  it('sends a complete event for an Error', () => {
    const { reporter, sent, clock } = setup({ release: 'abc123' });
    const err = new TypeError('Cannot read properties of undefined');
    expect(reporter.capture(err, { orderId: 'o-1' })).toBe(true);
    expect(sent).toStrictEqual([{
      fingerprint: 'TypeError: Cannot read properties of undefined',
      name: 'TypeError',
      message: 'Cannot read properties of undefined',
      stack: err.stack,
      release: 'abc123',
      timestamp: new Date(clock.t).toISOString(),
      suppressed: 0,
      context: { orderId: 'o-1' },
    }]);
  });

  it('normalises thrown non-Errors', () => {
    const { reporter, sent } = setup();
    reporter.capture('something broke');
    reporter.capture(undefined);
    expect(sent.map((e) => [e.name, e.message, e.stack, e.release, e.context])).toEqual([
      ['NonError', 'something broke', null, null, {}],
      ['NonError', 'undefined', null, null, {}],
    ]);
  });
});

describe('fingerprints', () => {
  it('groups messages that differ only by ids and numbers', () => {
    const { reporter, sent } = setup();
    reporter.capture(new Error('User 8812 not found'));
    reporter.capture(new Error('User 9113 not found'));
    reporter.capture(new Error('order 3f2b8c1e-9a4d-4e7b-8c2a-1b2c3d4e5f60 failed after 3 retries'));
    reporter.capture(new Error('order 3F2B8C1E-9A4D-4E7B-8C2A-1B2C3D4E5F61 failed after 12 retries'));
    reporter.capture(new RangeError('User 1 not found'));
    expect(sent.map((e) => e.fingerprint)).toEqual([
      'Error: User <n> not found',
      'Error: User <n> not found',
      'Error: order <uuid> failed after <n> retries',
      'Error: order <uuid> failed after <n> retries',
      'RangeError: User <n> not found',
    ]);
    expect(sent[1].message).toBe('User 9113 not found');
  });
});

describe('rate limiting', () => {
  it('sends at most maxPerWindow per fingerprint per window, and counts the rest', () => {
    const { reporter, sent, clock } = setup({ maxPerWindow: 2, windowMs: 1000 });
    const results = [];
    for (let i = 0; i < 5; i++) results.push(reporter.capture(new Error(`timeout after ${i}ms`)));
    results.push(reporter.capture(new Error('different problem')));
    expect(results).toEqual([true, true, false, false, false, true]);
    clock.t += 999;
    expect(reporter.capture(new Error('timeout after 7ms'))).toBe(false);
    clock.t += 1;                                   // the window has ended
    expect(reporter.capture(new Error('timeout after 8ms'))).toBe(true);
    expect(reporter.capture(new Error('timeout after 9ms'))).toBe(true);
    expect(reporter.capture(new Error('timeout after 9ms'))).toBe(false);
    const timeouts = sent.filter((e) => e.fingerprint === 'Error: timeout after <n>ms');
    expect(timeouts.map((e) => e.suppressed)).toEqual([0, 0, 4, 0]);
  });

  it('uses the defaults: 5 per 60 s', () => {
    const { reporter, clock } = setup();
    const results = [];
    for (let i = 0; i < 6; i++) results.push(reporter.capture(new Error('x')));
    expect(results).toEqual([true, true, true, true, true, false]);
    clock.t += 60_000;
    expect(reporter.capture(new Error('x'))).toBe(true);
  });
});

describe('scrubbing', () => {
  it('scrubs sensitive keys at any depth without touching the caller\'s object', () => {
    const { reporter, sent } = setup();
    const context = {
      user: { id: 7, email: 'a@x.io', password: 'hunter2', newPassword: 'hunter3' },
      headers: { Authorization: 'Bearer abc', 'x-auth-token': 't', cookie: 'sid=1', accept: 'json' },
      items: [{ sku: 'A', apiSecret: 's' }],
      tokenCount: 3,
    };
    const before = JSON.stringify(context);
    reporter.capture(new Error('x'), context);
    expect(sent[0].context).toStrictEqual({
      user: { id: 7, email: 'a@x.io', password: '[scrubbed]', newPassword: '[scrubbed]' },
      headers: { Authorization: '[scrubbed]', 'x-auth-token': '[scrubbed]', cookie: '[scrubbed]', accept: 'json' },
      items: [{ sku: 'A', apiSecret: '[scrubbed]' }],
      tokenCount: '[scrubbed]',
    });
    expect(JSON.stringify(context)).toBe(before);
  });

  it('uses custom scrub keys, case-insensitively', () => {
    const { reporter, sent } = setup({ scrubKeys: ['SSN'] });
    reporter.capture(new Error('x'), { ssn: '123', customerSsn: '456', password: 'kept' });
    expect(sent[0].context).toStrictEqual({ ssn: '[scrubbed]', customerSsn: '[scrubbed]', password: 'kept' });
  });
});

describe('a broken transport', () => {
  it('never throws and never leaves an unhandled rejection', async () => {
    const unhandled = [];
    const onUnhandled = (e) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    try {
      const sync = solution.createReporter({ transport: () => { throw new Error('tracker down'); } });
      expect(sync.capture(new Error('a'))).toBe(true);
      const async = solution.createReporter({ transport: async () => { throw new Error('tracker down'); } });
      expect(async.capture(new Error('b'))).toBe(true);
      await flush();
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('wrapHandler', () => {
  async function start(handler) {
    const { reporter, sent } = setup();
    const server = http.createServer(solution.wrapHandler(handler, reporter));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    const get = async (path, headers) => {
      const res = await fetch(base + path, { headers });
      return { status: res.status, json: await res.json().catch(() => null) };
    };
    return { get, sent, close: () => new Promise((r) => server.close(r)) };
  }

  it('reports server errors with request context and hides the message', async () => {
    const app = await start(async () => { throw new Error('connection to db-7.internal refused'); });
    try {
      const r = await app.get('/orders/9?expand=items', { 'x-request-id': 'req-42' });
      expect(r.status).toBe(500);
      expect(r.json).toEqual({ error: { code: 'INTERNAL', message: 'internal error' } });
      expect(app.sent).toHaveLength(1);
      expect(app.sent[0].message).toBe('connection to db-7.internal refused');
      expect(app.sent[0].context).toStrictEqual({ method: 'GET', path: '/orders/9', requestId: 'req-42' });
    } finally { await app.close(); }
  });

  it('answers client errors with their status and does not report them', async () => {
    const app = await start(async (req) => {
      const e = new Error(req.url === '/a' ? 'no such order' : 'quantity must be positive');
      e.status = req.url === '/a' ? 404 : 422;
      if (req.url === '/b') e.code = 'VALIDATION_FAILED';
      throw e;
    });
    try {
      const a = await app.get('/a');
      expect(a.status).toBe(404);
      expect(a.json).toEqual({ error: { code: 'BAD_REQUEST', message: 'no such order' } });
      const b = await app.get('/b');
      expect(b.status).toBe(422);
      expect(b.json.error.code).toBe('VALIDATION_FAILED');
      expect(app.sent).toEqual([]);
    } finally { await app.close(); }
  });

  it('treats status 500+ and odd statuses as server errors, with a null request id', async () => {
    const app = await start(async () => { const e = new Error('upstream'); e.status = 503; throw e; });
    try {
      const r = await app.get('/x');
      expect(r.status).toBe(500);
      expect(app.sent[0].context.requestId).toBeNull();
    } finally { await app.close(); }
  });

  it('reports and destroys the socket when headers were already sent', async () => {
    const app = await start(async (req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.write('partial');
      throw new Error('stream broke');
    });
    try {
      let failed = false;
      try {
        const r = await app.get('/stream');
        failed = r.json === null;
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
      expect(app.sent.map((e) => e.message)).toEqual(['stream broke']);
    } finally { await app.close(); }
  });

  it('passes successful responses through untouched', async () => {
    const app = await start(async (req, res) => { res.writeHead(201, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
    try {
      const r = await app.get('/');
      expect(r.status).toBe(201);
      expect(r.json).toEqual({ ok: true });
      expect(app.sent).toEqual([]);
    } finally { await app.close(); }
  });
});
