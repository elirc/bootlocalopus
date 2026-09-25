import http from 'node:http';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';

/** Raw client: no automatic decompression, so we see exactly what was sent. */
const request = (base, path, headers = {}) => new Promise((resolve, reject) => {
  const req = http.request(`${base}${path}`, { headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  });
  req.setTimeout(3000, () => req.destroy(new Error('the response never completed: does content-length match the bytes actually sent?')));
  req.on('error', reject);
  req.end();
});

const bigJson = JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ id: i, name: `customer ${i}`, active: i % 2 === 0 })));
const png = Buffer.alloc(5000, 0x42);

const routes = {
  '/big': { type: 'application/json; charset=utf-8', body: bigJson },
  '/small': { type: 'application/json', body: '{"ok":true}' },
  '/exact': { type: 'text/plain', body: 'x'.repeat(1024) },
  '/under': { type: 'text/plain', body: 'x'.repeat(1023) },
  '/png': { type: 'image/png', body: png },
  '/svg': { type: 'image/svg+xml', body: '<svg>' + '<rect/>'.repeat(400) + '</svg>' },
  '/zip': { type: 'application/zip', body: Buffer.alloc(3000, 1) },
  '/created': { status: 201, type: 'text/plain', body: 'é'.repeat(800) },
};

const withServer = async (fn) => {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.searchParams.get('vary')) res.setHeader('vary', url.searchParams.get('vary'));
    await solution.sendCompressed(req, res, routes[url.pathname]);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
};

describe('pickEncoding', () => {
  const pick = solution.pickEncoding;

  it('returns identity without a header', () => {
    expect(pick(undefined)).toBe('identity');
    expect(pick('')).toBe('identity');
    expect(pick('identity')).toBe('identity');
    expect(pick('deflate')).toBe('identity');
  });

  it('prefers br on a tie, and follows q otherwise', () => {
    expect(pick('gzip, deflate, br')).toBe('br');
    expect(pick('gzip')).toBe('gzip');
    expect(pick('br;q=0.5, gzip;q=0.8')).toBe('gzip');
    expect(pick(' GZIP ; q=0.9 , BR ; q=0.9 ')).toBe('br');
  });

  it('treats q=0 as a refusal, even with *', () => {
    expect(pick('gzip;q=0, *')).toBe('br');
    expect(pick('br;q=0, *;q=0.5')).toBe('gzip');
    expect(pick('br;q=0, gzip;q=0')).toBe('identity');
    expect(pick('*;q=0')).toBe('identity');
  });

  it('uses * for codings that are not listed', () => {
    expect(pick('*')).toBe('br');
    expect(pick('br;q=0.2, *;q=0.6')).toBe('gzip');
  });
});

describe('sendCompressed', () => {
  it('gzips a large JSON body with the right headers', () => withServer(async (base) => {
    const r = await request(base, '/big', { 'accept-encoding': 'gzip' });
    expect(r.status).toBe(200);
    expect(r.headers['content-encoding']).toBe('gzip');
    expect(r.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(r.headers.vary).toBe('Accept-Encoding');
    expect(Number(r.headers['content-length'])).toBe(r.body.length);
    expect(r.body.length).toBeLessThan(Buffer.byteLength(bigJson));
    expect(gunzipSync(r.body).toString()).toBe(bigJson);
  }));

  it('uses brotli when preferred', () => withServer(async (base) => {
    const r = await request(base, '/big', { 'accept-encoding': 'gzip, br' });
    expect(r.headers['content-encoding']).toBe('br');
    expect(Number(r.headers['content-length'])).toBe(r.body.length);
    expect(brotliDecompressSync(r.body).toString()).toBe(bigJson);
  }));

  it('sends identity (with Vary) when the client does not accept compression', () => withServer(async (base) => {
    const r = await request(base, '/big', { 'accept-encoding': 'gzip;q=0' });
    expect(r.headers['content-encoding']).toBeUndefined();
    expect(r.headers.vary).toBe('Accept-Encoding');
    expect(r.body.toString()).toBe(bigJson);
    expect(Number(r.headers['content-length'])).toBe(Buffer.byteLength(bigJson));
    const none = await request(base, '/big');
    expect(none.headers['content-encoding']).toBeUndefined();
    expect(none.headers.vary).toBe('Accept-Encoding');
  }));

  it('does not compress bodies under 1024 bytes', () => withServer(async (base) => {
    const small = await request(base, '/small', { 'accept-encoding': 'gzip, br' });
    expect(small.headers['content-encoding']).toBeUndefined();
    expect(small.body.toString()).toBe('{"ok":true}');
    const under = await request(base, '/under', { 'accept-encoding': 'gzip' });
    expect(under.headers['content-encoding']).toBeUndefined();
    const exact = await request(base, '/exact', { 'accept-encoding': 'gzip' });
    expect(exact.headers['content-encoding']).toBe('gzip');
  }));

  it('counts bytes, not characters, for the threshold and the length', () => withServer(async (base) => {
    // 800 × 'é' = 1600 bytes
    const r = await request(base, '/created', { 'accept-encoding': 'gzip' });
    expect(r.status).toBe(201);
    expect(r.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(r.body).toString()).toBe('é'.repeat(800));
    const plain = await request(base, '/created');
    expect(plain.headers['content-length']).toBe('1600');
  }));

  it('skips already-compressed types, but compresses SVG', () => withServer(async (base) => {
    const img = await request(base, '/png', { 'accept-encoding': 'gzip, br' });
    expect(img.headers['content-encoding']).toBeUndefined();
    expect(img.body.equals(png)).toBe(true);
    const zip = await request(base, '/zip', { 'accept-encoding': 'gzip' });
    expect(zip.headers['content-encoding']).toBeUndefined();
    const svg = await request(base, '/svg', { 'accept-encoding': 'gzip' });
    expect(svg.headers['content-encoding']).toBe('gzip');
  }));

  it('merges Vary with what is already set, without duplicates', () => withServer(async (base) => {
    const origin = await request(base, '/big?vary=Origin', { 'accept-encoding': 'gzip' });
    expect(origin.headers.vary).toBe('Origin, Accept-Encoding');
    const already = await request(base, '/big?vary=Origin,%20accept-encoding', { 'accept-encoding': 'gzip' });
    expect(already.headers.vary).toBe('Origin, accept-encoding');
  }));
});
