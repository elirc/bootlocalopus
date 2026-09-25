const { createLifecycle, StartupError } = solution;
const flush = () => new Promise((r) => setImmediate(r));
const rejection = async (promise) => {
  try { await promise; } catch (e) { return e; }
  throw new Error('expected a rejection');
};

/** Components that log `start:x` / `stop:x`, optionally failing. */
const setup = () => {
  const log = [];
  const lc = createLifecycle();
  const add = (name, { dependsOn, failStart, failStop } = {}) => lc.register(name, {
    async start() { log.push('start:' + name); if (failStart) throw failStart; },
    async stop() { log.push('stop:' + name); if (failStop) throw failStop; },
  }, dependsOn ? { dependsOn } : undefined);
  return { lc, log, add };
};

describe('ordering', () => {
  it('starts in registration order and stops in reverse', async () => {
    const s = setup();
    s.add('config'); s.add('db'); s.add('http');
    await s.lc.start();
    expect(s.lc.state).toBe('started');
    await s.lc.stop();
    expect(s.lc.state).toBe('stopped');
    expect(s.log).toEqual(['start:config', 'start:db', 'start:http', 'stop:http', 'stop:db', 'stop:config']);
  });

  it('starts dependencies first, even when they were registered later', async () => {
    const s = setup();
    s.add('http', { dependsOn: ['db', 'cache'] });
    s.add('worker', { dependsOn: ['queue'] });
    s.add('cache');
    s.add('db', { dependsOn: ['config'] });
    s.add('queue', { dependsOn: ['db'] });
    s.add('config');
    await s.lc.start();
    const started = s.log.map((l) => l.slice(6));
    const before = (a, b) => expect(started.indexOf(a)).toBeLessThan(started.indexOf(b));
    before('config', 'db'); before('db', 'http'); before('cache', 'http');
    before('db', 'queue'); before('queue', 'worker');
    expect(started).toHaveLength(6);
    expect(new Set(started).size).toBe(6);
    s.log.length = 0;
    await s.lc.stop();
    expect(s.log.map((l) => l.slice(5))).toEqual([...started].reverse());
  });

  it('keeps registration order between components that do not depend on each other', async () => {
    const s = setup();
    s.add('b'); s.add('a', { dependsOn: ['c'] }); s.add('c'); s.add('d');
    await s.lc.start();
    expect(s.log).toEqual(['start:b', 'start:c', 'start:a', 'start:d']);
  });

  it('refuses an unknown dependency or a cycle before starting anything', async () => {
    const s = setup();
    s.add('config'); s.add('http', { dependsOn: ['dbb'] });
    expect(await rejection(s.lc.start())).toBeInstanceOf(Error);
    expect(s.log).toEqual([]);
    expect(s.lc.state).toBe('stopped');

    const t = setup();
    t.add('first'); t.add('a', { dependsOn: ['b'] }); t.add('b', { dependsOn: ['a'] });
    expect(await rejection(t.lc.start())).toBeInstanceOf(Error);
    expect(t.log).toEqual([]);
  });

  it('rejects duplicate names, and registration while running', async () => {
    const s = setup();
    s.add('db');
    expect(() => s.add('db')).toThrow(Error);
    await s.lc.start();
    expect(() => s.add('late')).toThrow(Error);
    await s.lc.stop();
    expect(() => s.add('late')).not.toThrow();
  });
});

describe('a failed start rolls back', () => {
  it('stops what already started, in reverse, and reports which component failed', async () => {
    const s = setup();
    const boom = new Error('port 3000 in use');
    s.add('config'); s.add('db'); s.add('http', { failStart: boom }); s.add('never');
    const e = await rejection(s.lc.start());
    expect(e).toBeInstanceOf(StartupError);
    expect(e.name).toBe('StartupError');
    expect(e.component).toBe('http');
    expect(e.cause).toBe(boom);
    expect(s.log).toEqual(['start:config', 'start:db', 'start:http', 'stop:db', 'stop:config']);
    expect(s.lc.state).toBe('stopped');
  });

  it('keeps rolling back when a stop fails, and still reports the startup failure', async () => {
    const s = setup();
    s.add('a'); s.add('b', { failStop: new Error('b would not stop') }); s.add('c', { failStart: new Error('c broke') });
    const e = await rejection(s.lc.start());
    expect(e).toBeInstanceOf(StartupError);
    expect(e.component).toBe('c');
    expect(s.log).toEqual(['start:a', 'start:b', 'start:c', 'stop:b', 'stop:a']);
  });

  it('can be started again after a failure, from a clean slate', async () => {
    const log = [];
    let attempts = 0;
    const lc = createLifecycle();
    lc.register('db', { start: async () => { log.push('start:db'); }, stop: async () => { log.push('stop:db'); } });
    lc.register('http', { start: async () => { if (++attempts === 1) throw new Error('flaky'); log.push('start:http'); }, stop: async () => { log.push('stop:http'); } });
    await rejection(lc.start());
    await lc.start();
    expect(lc.state).toBe('started');
    await lc.stop();
    expect(log).toEqual(['start:db', 'stop:db', 'start:db', 'start:http', 'stop:http', 'stop:db']);
  });
});

describe('stop', () => {
  it('attempts every stop and rejects with an AggregateError of the failures', async () => {
    const s = setup();
    const e1 = new Error('flush failed');
    const e2 = new Error('socket stuck');
    s.add('a', { failStop: e2 }); s.add('b'); s.add('c', { failStop: e1 });
    await s.lc.start();
    s.log.length = 0;
    const e = await rejection(s.lc.stop());
    expect(e).toBeInstanceOf(AggregateError);
    expect(e.errors).toEqual([e1, e2]);
    expect(s.log).toEqual(['stop:c', 'stop:b', 'stop:a']);
    expect(s.lc.state).toBe('stopped');
  });

  it('components without start or stop are fine', async () => {
    const lc = createLifecycle();
    lc.register('noop', {});
    await lc.start();
    await lc.stop();
    expect(lc.state).toBe('stopped');
  });
});

describe('idempotence and concurrency', () => {
  it('start() twice starts once; stop() twice stops once', async () => {
    const s = setup();
    s.add('db');
    await s.lc.start();
    await s.lc.start();
    await s.lc.stop();
    await s.lc.stop();
    expect(s.log).toEqual(['start:db', 'stop:db']);
  });

  it('concurrent start() calls share one run', async () => {
    const pending = [];
    const lc = createLifecycle();
    let starts = 0;
    lc.register('db', { start: () => { starts++; return new Promise((r) => pending.push(r)); } });
    const a = lc.start();
    const b = lc.start();
    await flush();
    expect(lc.state).toBe('starting');
    expect(starts).toBe(1);
    pending[0]();
    await Promise.all([a, b]);
    expect(starts).toBe(1);
    expect(lc.state).toBe('started');
  });

  it('stop() during start waits for the start to finish, then stops everything', async () => {
    const pending = [];
    const log = [];
    const lc = createLifecycle();
    lc.register('db', { start: async () => { log.push('start:db'); }, stop: async () => { log.push('stop:db'); } });
    lc.register('http', {
      start: () => new Promise((r) => pending.push(() => { log.push('start:http'); r(); })),
      stop: async () => { log.push('stop:http'); },
    });
    const starting = lc.start();
    await flush();
    const stopping = lc.stop();
    await flush();
    expect(log).toEqual(['start:db']);
    pending[0]();
    await starting;
    await stopping;
    expect(log).toEqual(['start:db', 'start:http', 'stop:http', 'stop:db']);
    expect(lc.state).toBe('stopped');
  });

  it('stop() when never started does nothing', async () => {
    const s = setup();
    s.add('db');
    await s.lc.stop();
    expect(s.log).toEqual([]);
  });
});
