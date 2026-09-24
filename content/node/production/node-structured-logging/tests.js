import http from 'node:http';

const T0 = Date.UTC(2024, 0, 2, 3, 4, 5, 678);
const ISO = '2024-01-02T03:04:05.678Z';

const capture = (options = {}) => {
  const raw = [];
  const logger = solution.createLogger({ write: (line) => raw.push(line), now: () => T0, ...options });
  return { logger, raw, lines: () => raw.map((l) => JSON.parse(l)) };
};

const tick = () => new Promise((r) => setTimeout(r, 1));

/** Bounded poll for something that happens on another event (never a timing assertion). */
const until = async (cond, ms = 2000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 5));
  }
  return true;
};

describe('lines', () => {
  it('writes one JSON line per call with level, time and msg', () => {
    const { logger, raw, lines } = capture();
    logger.info('hello', { userId: 7 });
    expect(raw).toHaveLength(1);
    expect(typeof raw[0]).toBe('string');
    expect(raw[0]).not.toContain('\n');
    expect(lines()[0]).toStrictEqual({ level: 'info', time: ISO, msg: 'hello', userId: 7 });
  });

  it('works without fields, at every level', () => {
    const { logger, lines } = capture({ level: 'debug' });
    logger.debug('d'); logger.info('i'); logger.warn('w'); logger.error('e');
    expect(lines().map((l) => [l.level, l.msg])).toEqual([['debug', 'd'], ['info', 'i'], ['warn', 'w'], ['error', 'e']]);
    expect(lines()[0]).toStrictEqual({ level: 'debug', time: ISO, msg: 'd' });
  });

  it('drops lines below the configured level', () => {
    const warn = capture({ level: 'warn' });
    warn.logger.debug('x'); warn.logger.info('x'); warn.logger.warn('w'); warn.logger.error('e');
    expect(warn.lines().map((l) => l.level)).toEqual(['warn', 'error']);
    const dflt = capture();
    dflt.logger.debug('x'); dflt.logger.info('i');
    expect(dflt.lines().map((l) => l.level)).toEqual(['info']);
  });

  it('never lets fields override level, time or msg', () => {
    const { logger, lines } = capture();
    logger.warn('real', { level: 'debug', time: 'yesterday', msg: 'fake', other: 1 });
    expect(lines()[0]).toStrictEqual({ level: 'warn', time: ISO, msg: 'real', other: 1 });
  });
});

describe('child loggers', () => {
  it('carry their bindings, merged, with call fields winning', () => {
    const { logger, lines } = capture();
    const svc = logger.child({ service: 'billing', region: 'eu' });
    const job = svc.child({ job: 'invoice', region: 'us' });
    job.info('run', { attempt: 2, job: 'override' });
    svc.info('svc');
    logger.info('root');
    expect(lines()[0]).toStrictEqual({ level: 'info', time: ISO, msg: 'run', service: 'billing', region: 'us', job: 'override', attempt: 2 });
    expect(lines()[1]).toStrictEqual({ level: 'info', time: ISO, msg: 'svc', service: 'billing', region: 'eu' });
    expect(lines()[2]).toStrictEqual({ level: 'info', time: ISO, msg: 'root' });
  });

  it('share the level and writer', () => {
    const { logger, lines } = capture({ level: 'error' });
    logger.child({ a: 1 }).warn('dropped');
    logger.child({ a: 1 }).error('kept');
    expect(lines().map((l) => l.msg)).toEqual(['kept']);
  });
});

describe('redaction', () => {
  it('replaces values, not keys, at any depth and in any case', () => {
    const { logger, lines } = capture();
    logger.info('login', {
      user: 'ada', password: 'hunter2',
      headers: { Authorization: 'Bearer abc', Cookie: 'sid=1', accept: 'json' },
      attempts: [{ token: 't1', ok: false }, { TOKEN: 't2', ok: true }],
    });
    const line = lines()[0];
    expect(line.password).toBe('[REDACTED]');
    expect(line.headers).toStrictEqual({ Authorization: '[REDACTED]', Cookie: '[REDACTED]', accept: 'json' });
    expect(line.attempts).toStrictEqual([{ token: '[REDACTED]', ok: false }, { TOKEN: '[REDACTED]', ok: true }]);
    expect(line.user).toBe('ada');
    for (const secret of ['hunter2', 'Bearer abc', 'sid=1', 't1', 't2']) expect(JSON.stringify(line)).not.toContain(secret);
  });

  it('redacts a whole object value, and bindings too', () => {
    const { logger, lines } = capture();
    logger.child({ password: 'bound' }).info('x', { token: { value: 'deep', exp: 1 } });
    expect(lines()[0].password).toBe('[REDACTED]');
    expect(lines()[0].token).toBe('[REDACTED]');
  });

  it('does not mutate the caller\'s objects', () => {
    const { logger } = capture();
    const body = { password: 'hunter2', nested: { authorization: 'x' } };
    logger.info('x', { body });
    expect(body).toStrictEqual({ password: 'hunter2', nested: { authorization: 'x' } });
  });

  it('uses the configured key list', () => {
    const { logger, lines } = capture({ redact: ['ssn'] });
    logger.info('x', { SSN: '123', password: 'visible' });
    expect(lines()[0].SSN).toBe('[REDACTED]');
    expect(lines()[0].password).toBe('visible');
  });
});

describe('awkward values', () => {
  it('serialises Errors with name, message and stack, anywhere', () => {
    const { logger, lines } = capture();
    const err = new TypeError('bad thing');
    logger.error('failed', { err, nested: { cause: new Error('root') } });
    const line = lines()[0];
    expect(line.err.name).toBe('TypeError');
    expect(line.err.message).toBe('bad thing');
    expect(typeof line.err.stack).toBe('string');
    expect(line.err.stack).toContain('bad thing');
    expect(line.nested.cause.message).toBe('root');
  });

  it('survives circular references', () => {
    const { logger, lines } = capture();
    const a = { name: 'a' };
    a.self = a;
    const shared = { v: 1 };
    expect(() => logger.info('loop', { a, left: shared, right: shared })).not.toThrow();
    const line = lines()[0];
    expect(line.a).toStrictEqual({ name: 'a', self: '[Circular]' });
    // The same object twice is not a cycle.
    expect(line.left).toStrictEqual({ v: 1 });
    expect(line.right).toStrictEqual({ v: 1 });
  });
});

describe('context', () => {
  it('adds context fields to every line inside, across awaits and timers', async () => {
    const { logger, lines } = capture();
    const deep = async () => { await tick(); await tick(); logger.info('deep'); };
    await solution.withContext({ requestId: 'r1' }, async () => {
      logger.info('sync');
      await deep();
      await new Promise((r) => setTimeout(() => { logger.info('timer'); r(); }, 1));
      await new Promise((r) => setImmediate(() => { logger.child({ c: 1 }).info('immediate'); r(); }));
    });
    expect(lines().map((l) => [l.msg, l.requestId])).toEqual([['sync', 'r1'], ['deep', 'r1'], ['timer', 'r1'], ['immediate', 'r1']]);
  });

  it('returns what fn returns', async () => {
    expect(solution.withContext({ a: 1 }, () => 42)).toBe(42);
    expect(await solution.withContext({ a: 1 }, async () => 'x')).toBe('x');
  });

  it('adds nothing outside a context', async () => {
    const { logger, lines } = capture();
    await solution.withContext({ requestId: 'r1' }, async () => { await tick(); });
    logger.info('after');
    expect(lines()[0]).toStrictEqual({ level: 'info', time: ISO, msg: 'after' });
  });

  it('merges nested contexts, inner winning, and restores the outer one', () => {
    const { logger, lines } = capture();
    solution.withContext({ requestId: 'r1', user: 'u1' }, () => {
      solution.withContext({ user: 'u2', step: 'inner' }, () => logger.info('in'));
      logger.info('out');
    });
    expect(lines()[0]).toMatchObject({ requestId: 'r1', user: 'u2', step: 'inner' });
    expect(lines()[1]).toStrictEqual({ level: 'info', time: ISO, msg: 'out', requestId: 'r1', user: 'u1' });
  });

  it('lets fields override context', () => {
    const { logger, lines } = capture();
    solution.withContext({ requestId: 'r1', who: 'ctx' }, () => logger.child({ who: 'binding' }).info('x'));
    expect(lines()[0].who).toBe('binding');
  });

  it('never crosses concurrent contexts', async () => {
    const { logger, lines } = capture();
    const gates = {};
    const job = (id) => solution.withContext({ requestId: id }, async () => {
      logger.info('start');
      await new Promise((r) => { gates[id] = r; });
      await tick();
      logger.info('end');
    });
    const a = job('A');
    const b = job('B');
    gates.B();
    await b;
    gates.A();
    await a;
    expect(lines().map((l) => l.msg + ':' + l.requestId)).toEqual(['start:A', 'start:B', 'end:B', 'end:A']);
  });
});

describe('requestLogging', () => {
  const start = async (handler, options = {}) => {
    const cap = capture();
    let n = 0;
    const server = http.createServer(solution.requestLogging(handler(cap.logger), {
      logger: cap.logger, genId: () => 'gen-' + (++n), ...options,
    }));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    return {
      ...cap,
      get: (path, id) => fetch(base + path, { headers: id === undefined ? {} : { 'x-request-id': id } }),
      close: () => new Promise((r) => server.close(r)),
    };
  };

  const ok = (logger) => async (req, res) => {
    logger.info('handling');
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  };

  it('uses a valid incoming id and echoes it', async () => {
    const app = await start(ok);
    try {
      const res = await app.get('/x', 'abc-123');
      expect(res.status).toBe(200);
      expect(res.headers.get('x-request-id')).toBe('abc-123');
      expect(app.lines()[0]).toStrictEqual({ level: 'info', time: ISO, msg: 'handling', requestId: 'abc-123' });
    } finally { await app.close(); }
  });

  it('generates an id when the header is missing or unsafe', async () => {
    const app = await start(ok);
    try {
      expect((await app.get('/x')).headers.get('x-request-id')).toBe('gen-1');
      expect((await app.get('/x', 'has spaces')).headers.get('x-request-id')).toBe('gen-2');
      expect((await app.get('/x', 'a'.repeat(65))).headers.get('x-request-id')).toBe('gen-3');
      expect((await app.get('/x', '{"level":"error"}')).headers.get('x-request-id')).toBe('gen-4');
    } finally { await app.close(); }
  });

  it('logs completion with method, path, status and the id', async () => {
    const app = await start(() => (req, res) => { res.writeHead(201); res.end(); });
    try {
      await app.get('/things?secret=1', 'req-1');
      expect(await until(() => app.lines().some((l) => l.msg === 'request completed'))).toBe(true);
      const done = app.lines().find((l) => l.msg === 'request completed');
      expect(done).toStrictEqual({
        level: 'info', time: ISO, msg: 'request completed',
        requestId: 'req-1', method: 'GET', path: '/things', status: 201,
      });
    } finally { await app.close(); }
  });

  it('keeps ids apart across interleaved concurrent requests', async () => {
    const gates = {};
    const app = await start((logger) => {
      const deep = async (name) => { await tick(); logger.info('deep', { name }); };
      return async (req, res) => {
        const name = req.url.slice(1);
        logger.info('start', { name });
        await new Promise((r) => { gates[name] = r; });
        await deep(name);
        setTimeout(() => {
          logger.info('timer', { name });
          res.writeHead(200);
          res.end(name);
        }, 1);
      };
    });
    try {
      const a = app.get('/a', 'req-a');
      const b = app.get('/b', 'req-b');
      expect(await until(() => gates.a && gates.b)).toBe(true);
      gates.b();
      expect(await (await b).text()).toBe('b');
      gates.a();
      expect(await (await a).text()).toBe('a');
      expect(await until(() => app.lines().filter((l) => l.msg === 'request completed').length === 2)).toBe(true);

      const named = app.lines().filter((l) => l.name);
      expect(named).toHaveLength(6);
      for (const line of named) expect(line.requestId).toBe('req-' + line.name);
      const done = app.lines().filter((l) => l.msg === 'request completed');
      expect(done.map((l) => l.requestId + ' ' + l.path).sort()).toEqual(['req-a /a', 'req-b /b']);
    } finally { await app.close(); }
  });

  it('logs and answers 500 when the handler throws', async () => {
    const app = await start(() => async () => { await tick(); throw new Error('kaboom'); });
    try {
      const res = await app.get('/boom', 'req-err');
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'internal error' });
      const failed = app.lines().find((l) => l.msg === 'request failed');
      expect(failed).toBeDefined();
      expect(failed.level).toBe('error');
      expect(failed.requestId).toBe('req-err');
      expect(failed.err.message).toBe('kaboom');
    } finally { await app.close(); }
  });
});
