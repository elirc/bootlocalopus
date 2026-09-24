const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const start = async (handler, options = {}) => {
  const app = solution.createGracefulServer({ requestHandler: handler, ...options });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const { port } = app.server.address();
  // Delegate rather than spread: spreading would freeze the getters at 0/false.
  return {
    server: app.server,
    beginShutdown: () => app.beginShutdown(),
    shutdown: () => app.shutdown(),
    get activeRequests() { return app.activeRequests; },
    get isShuttingDown() { return app.isShuttingDown; },
    get: (path = '/') => fetch('http://127.0.0.1:' + port + path),
  };
};

const ok = (req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
};

describe('normal operation', () => {
  it('serves requests', async () => {
    const app = await start(ok);
    try {
      const res = await app.get();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally { await app.shutdown(); }
  });

  it('starts not shutting down, with no active requests', async () => {
    const app = await start(ok);
    try {
      expect(app.isShuttingDown).toBe(false);
      expect(app.activeRequests).toBe(0);
    } finally { await app.shutdown(); }
  });

  it('counts in-flight requests', async () => {
    let release;
    const app = await start(async (req, res) => {
      await new Promise((r) => { release = r; });
      ok(req, res);
    });
    try {
      const pending = app.get();
      await sleep(40);
      expect(app.activeRequests).toBe(1);
      release();
      await pending;
      await sleep(20);
      expect(app.activeRequests).toBe(0);
    } finally { await app.shutdown(); }
  });
});

describe('phase one: refusing while still listening', () => {
  it('answers new requests with 503', async () => {
    const app = await start(ok);
    try {
      expect((await app.get()).status).toBe(200);
      app.beginShutdown();
      const res = await app.get();
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'server is shutting down' });
    } finally { await app.shutdown(); }
  });

  it('asks the client to close the connection', async () => {
    const app = await start(ok);
    try {
      app.beginShutdown();
      const res = await app.get();
      expect(res.headers.get('connection')).toBe('close');
    } finally { await app.shutdown(); }
  });

  it('reports isShuttingDown', async () => {
    const app = await start(ok);
    try {
      app.beginShutdown();
      expect(app.isShuttingDown).toBe(true);
    } finally { await app.shutdown(); }
  });

  it('is idempotent', async () => {
    const app = await start(ok);
    try {
      app.beginShutdown();
      app.beginShutdown();
      expect((await app.get()).status).toBe(503);
    } finally { await app.shutdown(); }
  });

  it('does not count refused requests as active', async () => {
    const app = await start(ok);
    try {
      app.beginShutdown();
      await app.get();
      await sleep(20);
      expect(app.activeRequests).toBe(0);
    } finally { await app.shutdown(); }
  });

  it('still lets an already-running request finish', async () => {
    let release;
    const app = await start(async (req, res) => {
      if (req.url === '/slow') await new Promise((r) => { release = r; });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ path: req.url }));
    });
    const pending = app.get('/slow');
    await sleep(40);

    app.beginShutdown();
    expect((await app.get('/new')).status).toBe(503);

    release();
    const res = await pending;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: '/slow' });
    await app.shutdown();
  });
});

describe('phase two: closing and draining', () => {
  it('resolves cleanly with nothing in flight', async () => {
    const app = await start(ok);
    const result = await app.shutdown();
    expect(result).toEqual({ ok: true, forced: false });
    expect(app.isShuttingDown).toBe(true);
  });

  it('implies beginShutdown', async () => {
    const app = await start(ok);
    const shutting = app.shutdown();
    expect(app.isShuttingDown).toBe(true);
    await shutting;
  });

  it('lets an in-flight request finish', async () => {
    let release;
    const app = await start(async (req, res) => {
      await new Promise((r) => { release = r; });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ finished: true }));
    });

    const pending = app.get();
    await sleep(40);

    const shutting = app.shutdown();
    await sleep(20);
    release();

    const res = await pending;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ finished: true });

    const result = await shutting;
    expect(result.forced).toBe(false);
  });

  it('gives up after the drain timeout instead of hanging', async () => {
    const app = await start(
      async () => { await sleep(10_000); },
      { drainTimeoutMs: 80 },
    );
    app.get().catch(() => {});
    await sleep(40);

    const started = Date.now();
    const result = await app.shutdown();
    const elapsed = Date.now() - started;

    expect(result).toEqual({ ok: true, forced: true });
    // The handler would run 10 s; anything well under that proves the timeout fired.
    expect(elapsed).toBeLessThan(5000);
  });

  it('returns the same promise when called twice', async () => {
    const app = await start(ok);
    const first = app.shutdown();
    const second = app.shutdown();
    expect(first).toBe(second);
    await first;
  });

  it('stops listening once shut down', async () => {
    const app = await start(ok);
    await app.shutdown();
    await expect(app.get()).rejects.toThrow();
  });
});
