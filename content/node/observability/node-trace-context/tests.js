import http from 'node:http';

const T = '4bf92f3577b34da6a3ce929d0e0e4736';
const P = '00f067aa0ba902b7';

/** Deterministic ids: trace ids t000…1, t000…2; span ids s…1, s…2. */
function seqIds() {
  let t = 0;
  let s = 0;
  return {
    traceId: () => (++t).toString(16).padStart(32, 'a'),
    spanId: () => (++s).toString(16).padStart(16, 'b'),
  };
}

async function start(handler, options = {}) {
  const tracing = solution.createTracing({ ids: seqIds(), ...options });
  const server = http.createServer(tracing.middleware((req, res) => handler(tracing, req, res)));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = async (path, headers = {}) => {
    const res = await fetch(base + path, { headers });
    return { status: res.status, headers: res.headers, json: await res.json() };
  };
  return { tracing, get, close: () => new Promise((r) => server.close(r)) };
}

const echo = async (tracing, req, res) => {
  await new Promise((r) => setTimeout(r, 5));
  const body = { current: tracing.current(), outgoing: tracing.outgoingHeaders() };
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

describe('parseTraceparent', () => {
  it('parses a valid header', () => {
    expect(solution.parseTraceparent(`00-${T}-${P}-01`)).toStrictEqual({ version: '00', traceId: T, parentId: P, flags: 1 });
    expect(solution.parseTraceparent(`00-${T}-${P}-00`).flags).toBe(0);
    expect(solution.parseTraceparent(`00-${T}-${P}-03`).flags).toBe(3);
  });

  it('rejects malformed headers', () => {
    const bad = [
      undefined, '', 'garbage',
      `00-${T.toUpperCase()}-${P}-01`,
      `00-${'0'.repeat(32)}-${P}-01`,
      `00-${T}-${'0'.repeat(16)}-01`,
      `ff-${T}-${P}-01`,
      `00-${T}-${P}-01-extra`,
      ` 00-${T}-${P}-01`,
      `00-${T.slice(1)}-${P}-01`,
      `00-${T}-${P}-1`,
      `0-${T}-${P}-01`,
      `00-${T}-${P}-0g`,
      `00_${T}_${P}_01`,
    ];
    for (const h of bad) expect(solution.parseTraceparent(h)).toBeNull();
  });

  it('accepts extra fields only for future versions', () => {
    expect(solution.parseTraceparent(`01-${T}-${P}-01-what-ever`)).toStrictEqual({ version: '01', traceId: T, parentId: P, flags: 1 });
    expect(solution.parseTraceparent(`cc-${T}-${P}-00`).version).toBe('cc');
  });
});

describe('formatTraceparent', () => {
  it('formats version 00 with the sampled flag', () => {
    expect(solution.formatTraceparent({ traceId: T, spanId: P, sampled: true })).toBe(`00-${T}-${P}-01`);
    expect(solution.formatTraceparent({ traceId: T, spanId: P, sampled: false })).toBe(`00-${T}-${P}-00`);
  });
});

describe('middleware', () => {
  it('continues a valid incoming trace with a new span id and forwards tracestate', async () => {
    const app = await start(echo);
    try {
      const r = await app.get('/', { traceparent: `00-${T}-${P}-01`, tracestate: 'vendor=abc' });
      const span = 'b'.repeat(15) + '1';
      expect(r.json.current).toStrictEqual({ traceId: T, spanId: span, parentSpanId: P, sampled: true });
      expect(r.json.outgoing).toStrictEqual({ traceparent: `00-${T}-${span}-01`, tracestate: 'vendor=abc' });
      expect(r.headers.get('x-trace-id')).toBe(T);
    } finally { await app.close(); }
  });

  it('keeps the incoming sampling decision, and does not call sample()', async () => {
    let asked = 0;
    const app = await start(echo, { sample: () => { asked++; return true; } });
    try {
      const r = await app.get('/', { traceparent: `00-${T}-${P}-00` });
      expect(r.json.current.sampled).toBe(false);
      expect(r.json.outgoing.traceparent.endsWith('-00')).toBe(true);
      expect(asked).toBe(0);
    } finally { await app.close(); }
  });

  it('starts a new trace for a missing or invalid header, dropping tracestate', async () => {
    let asked = 0;
    const app = await start(echo, { sample: () => { asked++; return false; } });
    try {
      const a = await app.get('/');
      expect(a.json.current).toStrictEqual({ traceId: 'a'.repeat(31) + '1', spanId: 'b'.repeat(15) + '1', parentSpanId: null, sampled: false });
      expect(a.json.outgoing).toStrictEqual({ traceparent: `00-${'a'.repeat(31)}1-${'b'.repeat(15)}1-00` });
      const b = await app.get('/', { traceparent: `00-${'0'.repeat(32)}-${P}-01`, tracestate: 'vendor=abc' });
      expect(b.json.current.traceId).toBe('a'.repeat(31) + '2');
      expect(b.json.current.parentSpanId).toBeNull();
      expect(b.json.outgoing.tracestate).toBeUndefined();
      expect(b.headers.get('x-trace-id')).toBe('a'.repeat(31) + '2');
      expect(asked).toBe(2);
    } finally { await app.close(); }
  });

  it('keeps concurrent requests apart across awaits', async () => {
    const app = await start(async (tracing, req, res) => {
      const before = tracing.current().traceId;
      await new Promise((r) => setTimeout(r, req.url === '/slow' ? 60 : 5));
      const after = tracing.current().traceId;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ before, after, outgoing: tracing.outgoingHeaders().traceparent }));
    });
    try {
      const T2 = 'c'.repeat(32);
      const [slow, fast] = await Promise.all([
        app.get('/slow', { traceparent: `00-${T}-${P}-01` }),
        app.get('/fast', { traceparent: `00-${T2}-${P}-01` }),
      ]);
      expect(slow.json.before).toBe(T);
      expect(slow.json.after).toBe(T);
      expect(slow.json.outgoing.split('-')[1]).toBe(T);
      expect(fast.json.after).toBe(T2);
    } finally { await app.close(); }
  });

  it('returns null and {} outside a request, and passes the handler\'s return value through', async () => {
    const tracing = solution.createTracing({ ids: seqIds() });
    expect(tracing.current()).toBeNull();
    expect(tracing.outgoingHeaders()).toStrictEqual({});
    const fakeRes = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; } };
    const result = tracing.middleware(() => 'handled')({ headers: {} }, fakeRes);
    expect(result).toBe('handled');
    expect(fakeRes.headers['x-trace-id']).toBe('a'.repeat(31) + '1');
    expect(tracing.current()).toBeNull();
  });

  it('returns a copy from current()', async () => {
    const app = await start(async (tracing, req, res) => {
      const c = tracing.current();
      c.traceId = 'tampered';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ traceId: tracing.current().traceId }));
    });
    try {
      expect((await app.get('/', { traceparent: `00-${T}-${P}-01` })).json.traceId).toBe(T);
    } finally { await app.close(); }
  });

  it('uses random lowercase hex ids by default', async () => {
    const tracing = solution.createTracing();
    const fakeRes = { setHeader() {} };
    const ctx = tracing.middleware(() => tracing.current())({ headers: {} }, fakeRes);
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
    const other = tracing.middleware(() => tracing.current())({ headers: {} }, fakeRes);
    expect(other.traceId).not.toBe(ctx.traceId);
  });
});
