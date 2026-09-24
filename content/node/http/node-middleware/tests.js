import http from 'node:http';

const start = async (configure) => {
  const app = solution.createApp();
  configure(app);
  const server = http.createServer((req, res) => app.handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    get: (path = '/') => fetch('http://127.0.0.1:' + port + path),
    close: () => new Promise((r) => server.close(r)),
  };
};

const respond = (status, body) => (req, res) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

describe('the chain', () => {
  it('runs middleware in order', async () => {
    const order = [];
    const app = await start((a) => {
      a.use((req, res, next) => { order.push('first'); next(); });
      a.use((req, res, next) => { order.push('second'); next(); });
      a.use(respond(200, { ok: true }));
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(200);
      expect(order).toEqual(['first', 'second']);
    } finally { await app.close(); }
  });

  it('stops when a middleware responds without calling next', async () => {
    const reached = [];
    const app = await start((a) => {
      a.use((req, res) => { reached.push('responder'); respond(201, { made: true })(req, res); });
      a.use(() => { reached.push('should not run'); });
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ made: true });
      expect(reached).toEqual(['responder']);
    } finally { await app.close(); }
  });

  it('lets middleware share state through req', async () => {
    const app = await start((a) => {
      a.use((req, res, next) => { req.user = { id: 7 }; next(); });
      a.use((req, res) => respond(200, { userId: req.user.id })(req, res));
    });
    try {
      expect(await (await app.get()).json()).toEqual({ userId: 7 });
    } finally { await app.close(); }
  });

  it('404s when nobody responds', async () => {
    const app = await start((a) => {
      a.use((req, res, next) => next());
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not found' });
    } finally { await app.close(); }
  });

  it('404s an app with no middleware at all', async () => {
    const app = await start(() => {});
    try {
      expect((await app.get()).status).toBe(404);
    } finally { await app.close(); }
  });

  it('use() is chainable', async () => {
    const app = solution.createApp();
    expect(app.use(() => {})).toBe(app);
    expect(app.useError(() => {})).toBe(app);
  });

  it('ignores a second next() from the same middleware', async () => {
    const runs = [];
    const app = await start((a) => {
      a.use((req, res, next) => { next(); next(); });
      a.use((req, res, next) => { runs.push('downstream'); respond(200, {})(req, res); });
    });
    try {
      await app.get();
      expect(runs).toEqual(['downstream']);
    } finally { await app.close(); }
  });
});

describe('error routing', () => {
  it('next(err) jumps to the error handler', async () => {
    const skipped = [];
    const app = await start((a) => {
      a.use((req, res, next) => next(new Error('boom')));
      a.use(() => { skipped.push('normal middleware'); });
      a.useError((err, req, res) => respond(500, { error: err.message })(req, res));
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'boom' });
      expect(skipped).toEqual([]);
    } finally { await app.close(); }
  });

  it('catches a synchronous throw', async () => {
    const app = await start((a) => {
      a.use(() => { throw new Error('sync boom'); });
      a.useError((err, req, res) => respond(500, { error: err.message })(req, res));
    });
    try {
      expect(await (await app.get()).json()).toEqual({ error: 'sync boom' });
    } finally { await app.close(); }
  });

  it('catches an async rejection', async () => {
    const app = await start((a) => {
      a.use(async () => { throw new Error('async boom'); });
      a.useError((err, req, res) => respond(500, { error: err.message })(req, res));
    });
    try {
      expect(await (await app.get()).json()).toEqual({ error: 'async boom' });
    } finally { await app.close(); }
  });

  it('passes an error along the error chain with next(err)', async () => {
    const seen = [];
    const app = await start((a) => {
      a.use(() => { throw new Error('original'); });
      a.useError((err, req, res, next) => { seen.push('first'); next(err); });
      a.useError((err, req, res) => { seen.push('second'); respond(418, { error: err.message })(req, res); });
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(418);
      expect(seen).toEqual(['first', 'second']);
    } finally { await app.close(); }
  });

  it('lets an error handler recover and respond normally', async () => {
    const app = await start((a) => {
      a.use(() => { throw Object.assign(new Error('not found'), { status: 404 }); });
      a.useError((err, req, res) => respond(err.status ?? 500, { error: err.message })(req, res));
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(404);
    } finally { await app.close(); }
  });

  it('500s when an error has no handler', async () => {
    const app = await start((a) => {
      a.use(() => { throw new Error('nobody is listening'); });
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'internal error' });
    } finally { await app.close(); }
  });

  it('500s when the error handler itself throws', async () => {
    const app = await start((a) => {
      a.use(() => { throw new Error('first'); });
      a.useError(() => { throw new Error('handler broke too'); });
    });
    try {
      expect((await app.get()).status).toBe(500);
    } finally { await app.close(); }
  });

  it('keeps serving after an error', async () => {
    let requests = 0;
    const app = await start((a) => {
      a.use((req, res, next) => {
        requests++;
        if (requests === 1) throw new Error('first request fails');
        next();
      });
      a.use(respond(200, { ok: true }));
      a.useError((err, req, res) => respond(500, { error: err.message })(req, res));
    });
    try {
      expect((await app.get()).status).toBe(500);
      expect((await app.get()).status).toBe(200);
    } finally { await app.close(); }
  });
});