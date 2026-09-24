import http from 'node:http';

describe('ApiError', () => {
  it('is a real Error carrying status, code and details', () => {
    const err = new solution.ApiError(422, 'UNPROCESSABLE', 'nope', { field: 'x' });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(422);
    expect(err.code).toBe('UNPROCESSABLE');
    expect(err.message).toBe('nope');
    expect(err.details).toEqual({ field: 'x' });
    expect(typeof err.stack).toBe('string');
  });
});

describe('the factories', () => {
  it('notFound', () => {
    const err = solution.notFound('User', 42);
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('User 42 not found');
  });
  it('badRequest carries details', () => {
    const err = solution.badRequest('invalid body', { email: 'required' });
    expect(err.status).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.details).toEqual({ email: 'required' });
  });
  it('unauthorized', () => {
    const err = solution.unauthorized();
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('authentication required');
  });
});

describe('toResponse', () => {
  it('maps an ApiError onto the envelope', () => {
    expect(solution.toResponse(solution.notFound('User', 42))).toEqual({
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'User 42 not found' } },
    });
  });

  it('includes details when present', () => {
    const out = solution.toResponse(solution.badRequest('invalid', { email: 'required' }));
    expect(out.body.error.details).toEqual({ email: 'required' });
  });

  it('omits details entirely when there are none', () => {
    const out = solution.toResponse(solution.unauthorized());
    expect('details' in out.body.error).toBe(false);
  });

  it('turns an unexpected error into a generic 500', () => {
    const out = solution.toResponse(new Error('connection to postgres://user:pw@db failed'));
    expect(out.status).toBe(500);
    expect(out.body.error.code).toBe('INTERNAL');
    expect(out.body.error.message).toBe('internal server error');
  });

  it('never leaks an internal message or stack by default', () => {
    const dbError = new Error('relation "secret_users" does not exist');
    const out = solution.toResponse(dbError);
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain('secret_users');
    expect(serialised).not.toContain('stack');
  });

  it('handles a thrown non-Error', () => {
    const out = solution.toResponse('just a string');
    expect(out.status).toBe(500);
    expect(out.body.error.code).toBe('INTERNAL');
  });

  it('exposes the stack only when asked', () => {
    const out = solution.toResponse(new Error('boom'), { exposeStack: true });
    expect(typeof out.body.error.stack).toBe('string');
    expect(out.body.error.stack.length).toBeGreaterThan(0);
  });
});

describe('handler', () => {
  // A silent logger by default, so expected 500s do not clutter the output.
  const start = async (fn, options = { logger: () => {} }) => {
    const server = http.createServer(solution.handler(fn, options));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    return {
      get: () => fetch('http://127.0.0.1:' + port + '/'),
      close: () => new Promise((r) => server.close(r)),
    };
  };

  it('leaves a successful response alone', async () => {
    const app = await start(async (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally { await app.close(); }
  });

  it('turns a thrown ApiError into its response', async () => {
    const app = await start(async () => { throw solution.notFound('Post', 9); });
    try {
      const res = await app.get();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: { code: 'NOT_FOUND', message: 'Post 9 not found' },
      });
    } finally { await app.close(); }
  });

  it('turns an unexpected throw into a safe 500', async () => {
    const app = await start(async () => { throw new Error('internal detail'); });
    try {
      const res = await app.get();
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.message).toBe('internal server error');
      expect(JSON.stringify(body)).not.toContain('internal detail');
    } finally { await app.close(); }
  });

  it('logs the original error behind a 500, and not a 4xx', async () => {
    const logged = [];
    const boom = new Error('connection to db-primary refused');
    const app = await start(async () => { throw boom; }, { logger: (e) => logged.push(e) });
    const app404 = await start(async () => { throw solution.notFound('Post', 9); }, { logger: (e) => logged.push(e) });
    try {
      expect((await app.get()).status).toBe(500);
      expect(logged).toHaveLength(1);
      expect(logged[0]).toBe(boom);
      expect((await app404.get()).status).toBe(404);
      expect(logged).toHaveLength(1);
    } finally {
      await app.close();
      await app404.close();
    }
  });

  it('does not try to respond twice if the handler already replied', async () => {
    const app = await start(async (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ sent: true }));
      throw new Error('too late');
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ sent: true });
    } finally { await app.close(); }
  });
});