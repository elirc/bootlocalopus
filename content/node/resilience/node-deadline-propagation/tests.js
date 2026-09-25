const H = 'x-request-timeout-ms';

describe('readBudget', () => {
  it('reads a whole number of milliseconds', () => {
    expect(solution.readBudget({ [H]: '800' })).toBe(800);
    expect(solution.readBudget({ [H]: '0' })).toBe(0);
    expect(solution.readBudget({ [H]: '0250' })).toBe(250);
  });

  it('caps what the client asks for', () => {
    expect(solution.readBudget({ [H]: '3600000' })).toBe(30_000);
    expect(solution.readBudget({ [H]: '5000' }, { maxMs: 2000 })).toBe(2000);
    expect(solution.readBudget({ [H]: '99999999999999999999999' }, { maxMs: 2000 })).toBe(2000);
  });

  it('falls back to the default for anything else', () => {
    for (const value of [undefined, '', ' ', '-5', '1.5', '1e3', '0x10', '5ms', 'soon', ['100', '200']]) {
      expect([value, solution.readBudget(value === undefined ? {} : { [H]: value })]).toEqual([value, 10_000]);
    }
    expect(solution.readBudget({}, { defaultMs: 1234 })).toBe(1234);
  });
});

describe('createDeadline', () => {
  it('counts down from creation time', () => {
    const clock = { t: 1000 };
    const d = solution.createDeadline(500, { now: () => clock.t });
    expect(d.remaining()).toBe(500);
    clock.t += 200;
    expect(d.remaining()).toBe(300);
    expect(d.expired()).toBe(false);
    clock.t += 299;
    expect(d.expired()).toBe(false);
    clock.t += 1;
    expect(d.remaining()).toBe(0);
    expect(d.expired()).toBe(true);
    clock.t += 1000;
    expect(d.remaining()).toBe(0);
  });

  it('forwards what is left minus a margin, never negative', () => {
    const clock = { t: 0 };
    const d = solution.createDeadline(1000, { now: () => clock.t });
    expect(d.outgoingHeaders()).toEqual({ [H]: '1000' });
    clock.t = 300;
    expect(d.outgoingHeaders(20)).toEqual({ [H]: '680' });
    clock.t = 990;
    expect(d.outgoingHeaders(20)).toEqual({ [H]: '0' });
  });

  it('child deadlines take the smaller of the cap and what is left, and tick on the same clock', () => {
    const clock = { t: 0 };
    const d = solution.createDeadline(1000, { now: () => clock.t });
    const capped = d.child(200);
    expect(capped.remaining()).toBe(200);
    clock.t = 900;
    expect(capped.remaining()).toBe(0);
    const tail = d.child(500);
    expect(tail.remaining()).toBe(100);
    clock.t = 950;
    expect(tail.remaining()).toBe(50);
    expect(d.remaining()).toBe(50);
  });
});

describe('createServer', () => {
  const run = async ({ headers = {}, path = '/price/sku-1', lookup, ...opts }) => {
    const clock = { t: 1_000_000 };
    const calls = [];
    const lookupPrice = async (sku, ctx) => {
      calls.push({ sku, headers: ctx.headers, remaining: ctx.deadline.remaining() });
      return lookup ? lookup(clock, sku, ctx) : 1999;
    };
    const server = solution.createServer({ lookupPrice, now: () => clock.t, ...opts });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers });
      return { status: res.status, type: res.headers.get('content-type'), body: await res.json(), calls };
    } finally {
      await new Promise((r) => server.close(r));
    }
  };

  it('forwards the remaining budget minus the margin', async () => {
    const r = await run({ headers: { [H]: '800' } });
    expect(r.status).toBe(200);
    expect(r.type).toMatch(/application\/json/);
    expect(r.body).toEqual({ sku: 'sku-1', price: 1999 });
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].headers).toEqual({ [H]: '780' });
    expect(r.calls[0].remaining).toBe(800);
  });

  it('uses the default and the cap', async () => {
    expect((await run({})).calls[0].headers).toEqual({ [H]: '9980' });
    expect((await run({ headers: { [H]: '100000' }, maxMs: 5000, marginMs: 0 })).calls[0].headers).toEqual({ [H]: '5000' });
  });

  it('refuses a budget too small to be useful without calling downstream', async () => {
    for (const budget of ['0', '49']) {
      const r = await run({ headers: { [H]: budget } });
      expect(r.status).toBe(504);
      expect(r.body).toEqual({ error: 'insufficient-deadline' });
      expect(r.calls).toHaveLength(0);
    }
    expect((await run({ headers: { [H]: '50' } })).status).toBe(200);
  });

  it('504s when the deadline passed while waiting for downstream', async () => {
    const r = await run({ headers: { [H]: '300' }, lookup: (clock) => { clock.t += 300; return 5; } });
    expect(r.status).toBe(504);
    expect(r.body).toEqual({ error: 'deadline-exceeded' });
    const ok = await run({ headers: { [H]: '300' }, lookup: (clock) => { clock.t += 299; return 5; } });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ sku: 'sku-1', price: 5 });
  });

  it('502s when downstream fails', async () => {
    const r = await run({ lookup: () => { throw new Error('boom'); } });
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ error: 'upstream-failed' });
  });

  it('decodes the sku and 404s other routes', async () => {
    expect((await run({ path: '/price/blue%20shirt' })).calls[0].sku).toBe('blue shirt');
    for (const path of ['/price/', '/prices/x', '/price/a/b', '/']) {
      const r = await run({ path });
      expect([path, r.status, r.body]).toEqual([path, 404, { error: 'not-found' }]);
    }
  });
});
