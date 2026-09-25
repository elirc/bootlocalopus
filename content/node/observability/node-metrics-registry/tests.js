const reg = (opts) => solution.createRegistry(opts);

describe('counters', () => {
  it('renders HELP, TYPE and one line per series, in first-seen order', () => {
    const r = reg();
    const jobs = r.counter({ name: 'jobs_processed_total', help: 'Jobs processed by the worker.', labelNames: ['queue', 'outcome'] });
    jobs.inc({ queue: 'email', outcome: 'ok' });
    jobs.inc({ outcome: 'failed', queue: 'email' }, 3);
    jobs.inc({ queue: 'email', outcome: 'ok' }, 2);
    expect(r.metrics()).toBe(
      '# HELP jobs_processed_total Jobs processed by the worker.\n' +
      '# TYPE jobs_processed_total counter\n' +
      'jobs_processed_total{queue="email",outcome="ok"} 3\n' +
      'jobs_processed_total{queue="email",outcome="failed"} 3\n',
    );
  });

  it('prints an unlabelled metric as 0 before use, and a labelled one with no lines', () => {
    const r = reg();
    const up = r.counter({ name: 'restarts_total', help: 'Restarts.' });
    r.counter({ name: 'errors_total', help: 'Errors.', labelNames: ['kind'] });
    expect(r.metrics()).toBe('# HELP restarts_total Restarts.\n# TYPE restarts_total counter\nrestarts_total 0\n# HELP errors_total Errors.\n# TYPE errors_total counter\n');
    up.inc();
    up.inc({}, 0.5);
    expect(r.metrics().split('\n')[2]).toBe('restarts_total 1.5');
  });

  it('refuses to go down, and refuses non-finite values', () => {
    const c = reg().counter({ name: 'c_total', help: 'c' });
    expect(() => c.inc({}, -1)).toThrow(RangeError);
    for (const bad of [NaN, Infinity, '2']) expect(() => c.inc({}, bad)).toThrow(RangeError);
  });

  it('requires exactly the declared labels', () => {
    const c = reg().counter({ name: 'http_total', help: 'h', labelNames: ['method', 'status'] });
    expect(() => c.inc({ method: 'GET' })).toThrow(TypeError);
    expect(() => c.inc({ method: 'GET', status: 200, path: '/x' })).toThrow(TypeError);
    expect(() => c.inc()).toThrow(TypeError);
    c.inc({ method: 'GET', status: 200 });
  });

  it('never merges two different label sets into one series', () => {
    const r = reg();
    const c = r.counter({ name: 'pairs_total', help: 'p', labelNames: ['a', 'b'] });
    c.inc({ a: 'x,y', b: 'z' });
    c.inc({ a: 'x', b: 'y,z' });
    c.inc({ a: 1, b: 2 });
    c.inc({ a: '1', b: '2' });
    const lines = r.metrics().trim().split('\n').slice(2);
    expect(lines).toEqual(['pairs_total{a="x,y",b="z"} 1', 'pairs_total{a="x",b="y,z"} 1', 'pairs_total{a="1",b="2"} 2']);
  });
});

describe('gauges', () => {
  it('sets, increments and decrements', () => {
    const r = reg();
    const g = r.gauge({ name: 'queue_depth', help: 'Jobs waiting.', labelNames: ['queue'] });
    g.set({ queue: 'email' }, 10);
    g.dec({ queue: 'email' }, 3);
    g.inc({ queue: 'email' });
    g.dec({ queue: 'sms' });
    expect(r.metrics()).toBe('# HELP queue_depth Jobs waiting.\n# TYPE queue_depth gauge\nqueue_depth{queue="email"} 8\nqueue_depth{queue="sms"} -1\n');
    expect(() => g.set({ queue: 'x' }, NaN)).toThrow(RangeError);
  });
});

describe('the exposition format', () => {
  it('escapes label values and help text', () => {
    const r = reg();
    const c = r.counter({ name: 'odd_total', help: 'A \\ backslash\nand a newline', labelNames: ['v'] });
    c.inc({ v: 'say "hi"\\now\nplease' });
    expect(r.metrics()).toBe(
      '# HELP odd_total A \\\\ backslash\\nand a newline\n' +
      '# TYPE odd_total counter\n' +
      'odd_total{v="say \\"hi\\"\\\\now\\nplease"} 1\n',
    );
  });

  it('keeps metrics in registration order', () => {
    const r = reg();
    r.gauge({ name: 'b_gauge', help: 'b' });
    r.counter({ name: 'a_total', help: 'a' });
    expect(r.metrics().split('\n').filter((l) => l.startsWith('# TYPE'))).toEqual(['# TYPE b_gauge gauge', '# TYPE a_total counter']);
  });
});

describe('registration', () => {
  it('validates metric and label names, and refuses duplicates', () => {
    const r = reg();
    for (const name of ['2xx_total', 'http-requests', 'a b', '']) {
      expect(() => r.counter({ name, help: 'x' })).toThrow(TypeError);
    }
    for (const label of ['__name', 'status-code', '1st']) {
      expect(() => r.counter({ name: 'ok_' + Math.random().toString(36).slice(2), help: 'x', labelNames: [label] })).toThrow(TypeError);
    }
    r.counter({ name: 'ns:requests_total', help: 'x', labelNames: ['_private'] });
    expect(() => r.gauge({ name: 'ns:requests_total', help: 'x' })).toThrow(Error);
  });
});

describe('cardinality', () => {
  it('caps series per metric and counts what it dropped', () => {
    const r = reg({ maxSeries: 3 });
    const c = r.counter({ name: 'by_user_total', help: 'A label that should never have been added.', labelNames: ['user'] });
    const other = r.counter({ name: 'other_total', help: 'o', labelNames: ['k'] });
    for (let i = 0; i < 10; i++) c.inc({ user: 'u' + i });
    c.inc({ user: 'u0' }, 5);                 // an existing series still updates
    expect(c.dropped).toBe(7);
    const lines = r.metrics().split('\n').filter((l) => l.startsWith('by_user_total'));
    expect(lines).toEqual(['by_user_total{user="u0"} 6', 'by_user_total{user="u1"} 1', 'by_user_total{user="u2"} 1']);
    other.inc({ k: 'a' });
    expect(other.dropped).toBe(0);
  });

  it('defaults to 1000 series', () => {
    const g = reg().gauge({ name: 'g', help: 'g', labelNames: ['i'] });
    for (let i = 0; i < 1001; i++) g.set({ i }, 1);
    expect(g.dropped).toBe(1);
  });
});
