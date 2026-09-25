function setup(extra = {}) {
  const clock = { t: 1000 };
  const exported = [];
  let t = 0;
  let s = 0;
  const ids = { traceId: () => 'trace' + ++t, spanId: () => 'span' + ++s };
  const tracer = solution.createTracer({ exporter: { export: (r) => exported.push(r) }, now: () => clock.t, ids, ...extra });
  const byName = (n) => exported.find((r) => r.name === n);
  return { tracer, clock, exported, byName };
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

describe('a single span', () => {
  it('exports a complete record when fn resolves', async () => {
    const { tracer, clock, exported } = setup();
    const result = await tracer.startActiveSpan('load cart', async (span) => {
      span.setAttribute('cart.items', 3);
      clock.t += 40;
      span.addEvent('cache miss', { key: 'cart:7' });
      clock.t += 10;
      return 'cart';
    }, { attributes: { 'user.id': 'u7' } });
    expect(result).toBe('cart');
    expect(exported).toStrictEqual([{
      name: 'load cart',
      traceId: 'trace1',
      spanId: 'span1',
      parentSpanId: null,
      startTime: 1000,
      endTime: 1050,
      durationMs: 50,
      status: 'ok',
      attributes: { 'user.id': 'u7', 'cart.items': 3 },
      events: [{ name: 'cache miss', time: 1040, attributes: { key: 'cart:7' } }],
    }]);
  });

  it('works with a synchronous fn and always returns a promise', async () => {
    const { tracer, exported } = setup();
    const p = tracer.startActiveSpan('sync', () => 42);
    expect(p).toBeInstanceOf(Promise);
    expect(await p).toBe(42);
    expect(exported[0].status).toBe('ok');
  });

  it('does not share the caller\'s attributes object', async () => {
    const { tracer, exported } = setup();
    const attrs = { a: 1 };
    await tracer.startActiveSpan('x', (span) => span.setAttribute('b', 2), { attributes: attrs });
    expect(attrs).toStrictEqual({ a: 1 });
    expect(exported[0].attributes).toStrictEqual({ a: 1, b: 2 });
  });
});

describe('errors', () => {
  it('records an exception event and error status, and rethrows the original', async () => {
    const { tracer, clock, exported } = setup();
    const boom = new TypeError('card declined');
    let caught;
    try {
      await tracer.startActiveSpan('charge card', async () => { clock.t += 2200; throw boom; });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(boom);
    expect(exported).toHaveLength(1);
    expect(exported[0].status).toBe('error');
    expect(exported[0].durationMs).toBe(2200);
    expect(exported[0].events).toStrictEqual([
      { name: 'exception', time: 3200, attributes: { 'exception.type': 'TypeError', 'exception.message': 'card declined' } },
    ]);
  });

  it('handles a synchronous throw', async () => {
    const { tracer, exported } = setup();
    const p = tracer.startActiveSpan('sync', () => { throw new Error('sync'); });
    let caught;
    await p.catch((e) => { caught = e; });
    expect(caught.message).toBe('sync');
    expect(exported[0].status).toBe('error');
  });

  it('ignores an exporter that throws', async () => {
    const tracer = solution.createTracer({ exporter: { export: () => { throw new Error('collector down'); } }, now: () => 0 });
    expect(await tracer.startActiveSpan('x', async () => 'still works')).toBe('still works');
  });
});

describe('parents and children', () => {
  it('nests spans started inside fn, and restores the parent afterwards', async () => {
    const { tracer, byName } = setup();
    await tracer.startActiveSpan('POST /checkout', async (root) => {
      expect(tracer.activeSpan()).toStrictEqual({ traceId: root.traceId, spanId: root.spanId });
      await tracer.startActiveSpan('load cart', async () => { await tick(1); });
      expect(tracer.activeSpan().spanId).toBe(root.spanId);
      await tracer.startActiveSpan('charge card', async () => {
        await tracer.startActiveSpan('http POST psp', async () => {});
      });
    });
    const root = byName('POST /checkout');
    expect(root.parentSpanId).toBeNull();
    expect(byName('load cart').parentSpanId).toBe(root.spanId);
    expect(byName('charge card').parentSpanId).toBe(root.spanId);
    expect(byName('http POST psp').parentSpanId).toBe(byName('charge card').spanId);
    for (const n of ['load cart', 'charge card', 'http POST psp']) expect(byName(n).traceId).toBe(root.traceId);
    expect(tracer.activeSpan()).toBeNull();
  });

  it('gives concurrent siblings the right parent', async () => {
    const { tracer, byName } = setup();
    await tracer.startActiveSpan('root', async () => {
      await Promise.all([
        tracer.startActiveSpan('a', async () => { await tick(20); await tracer.startActiveSpan('a.child', async () => {}); }),
        tracer.startActiveSpan('b', async () => { await tick(5); await tracer.startActiveSpan('b.child', async () => {}); }),
      ]);
    });
    const root = byName('root').spanId;
    expect(byName('a').parentSpanId).toBe(root);
    expect(byName('b').parentSpanId).toBe(root);
    expect(byName('a.child').parentSpanId).toBe(byName('a').spanId);
    expect(byName('b.child').parentSpanId).toBe(byName('b').spanId);
  });

  it('starts a new trace for each root span', async () => {
    const { tracer, exported } = setup();
    await tracer.startActiveSpan('one', () => {});
    await tracer.startActiveSpan('two', () => {});
    expect(exported.map((r) => [r.traceId, r.spanId])).toEqual([['trace1', 'span1'], ['trace2', 'span2']]);
  });

  it('exports children before their parent', async () => {
    const { tracer, exported } = setup();
    await tracer.startActiveSpan('parent', () => tracer.startActiveSpan('child', () => {}));
    expect(exported.map((r) => r.name)).toEqual(['child', 'parent']);
  });
});

describe('after the end', () => {
  it('ignores attributes and events added to an ended span', async () => {
    const { tracer, exported } = setup();
    let leaked;
    await tracer.startActiveSpan('short', (span) => { leaked = span; });
    leaked.setAttribute('late', true);
    leaked.addEvent('late');
    expect(exported[0].attributes).toStrictEqual({});
    expect(exported[0].events).toStrictEqual([]);
    expect(exported).toHaveLength(1);
  });

  it('uses random hex ids by default', async () => {
    const exported = [];
    const tracer = solution.createTracer({ exporter: { export: (r) => exported.push(r) } });
    await tracer.startActiveSpan('x', () => {});
    expect(exported[0].traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(exported[0].spanId).toMatch(/^[0-9a-f]{16}$/);
  });
});
