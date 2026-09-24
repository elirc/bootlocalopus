import { Readable } from 'node:stream';

const fakeRequest = (body) => Readable.from([Buffer.from(body)]);

const start = async () => {
  const server = solution.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    post: (path, body, headers) => fetch('http://127.0.0.1:' + port + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    }),
    close: () => new Promise((r) => server.close(r)),
  };
};

describe('readJson', () => {
  it('parses a JSON object', async () => {
    expect(await solution.readJson(fakeRequest('{"name":"ada"}'))).toEqual({ name: 'ada' });
  });

  it('returns {} for an empty body', async () => {
    expect(await solution.readJson(fakeRequest(''))).toEqual({});
  });

  it('handles a body arriving in several chunks', async () => {
    const chunked = Readable.from([Buffer.from('{"a":'), Buffer.from('1'), Buffer.from('}')]);
    expect(await solution.readJson(chunked)).toEqual({ a: 1 });
  });

  it('rejects invalid JSON with status 400', async () => {
    let caught;
    try { await solution.readJson(fakeRequest('{not json')); } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect(caught.status).toBe(400);
    expect(caught.message).toBe('invalid json');
  });

  it('rejects a non-object body with status 400', async () => {
    for (const body of ['"a string"', '42', 'true', '[1,2,3]', 'null']) {
      let caught;
      try { await solution.readJson(fakeRequest(body)); } catch (e) { caught = e; }
      expect(caught?.status).toBe(400);
    }
  });

  it('rejects an oversized body with status 413', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(2000) });
    let caught;
    try { await solution.readJson(fakeRequest(big), { limit: 100 }); } catch (e) { caught = e; }
    expect(caught?.status).toBe(413);
    expect(caught.message).toBe('payload too large');
  });

  it('stops reading instead of buffering the whole oversized body', async () => {
    let produced = 0;
    const endless = new Readable({
      read() {
        produced++;
        this.push(Buffer.alloc(64, 'x'));
      },
    });
    let caught;
    try { await solution.readJson(endless, { limit: 128 }); } catch (e) { caught = e; }
    expect(caught?.status).toBe(413);
    // It must give up almost immediately, not read forever.
    expect(produced).toBeLessThan(20);
  });

  it('accepts a body exactly at the limit', async () => {
    const body = '{"a":1}';
    expect(await solution.readJson(fakeRequest(body), { limit: body.length })).toEqual({ a: 1 });
  });
});

describe('the server', () => {
  it('echoes a valid body', async () => {
    const app = await start();
    try {
      const res = await app.post('/echo', '{"hello":"world"}');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: { hello: 'world' } });
    } finally { await app.close(); }
  });

  it('returns 400 for malformed JSON', async () => {
    const app = await start();
    try {
      const res = await app.post('/echo', '{oops');
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('invalid json');
    } finally { await app.close(); }
  });

  it('returns 413 for a body over the limit', async () => {
    const app = await start();
    try {
      const res = await app.post('/echo', JSON.stringify({ pad: 'x'.repeat(5000) }));
      expect(res.status).toBe(413);
    } finally { await app.close(); }
  });

  it('does not crash the process on a bad body', async () => {
    const app = await start();
    try {
      await app.post('/echo', '{bad');
      const res = await app.post('/echo', '{"still":"alive"}');
      expect(res.status).toBe(200);
    } finally { await app.close(); }
  });

  it('404s other routes', async () => {
    const app = await start();
    try {
      expect((await app.post('/nope', '{}')).status).toBe(404);
    } finally { await app.close(); }
  });
});