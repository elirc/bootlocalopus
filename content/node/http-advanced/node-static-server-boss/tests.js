import http from 'node:http';
import { access, mkdtemp, rm, writeFile, mkdir, stat, utimes } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * os.tmpdir() reads TEMP/TMP; a grading sandbox with a bare environment on
 * Windows has neither, so fall back to this run's own scratch folder.
 */
const tmpBase = async () => {
  try { await access(os.tmpdir()); return os.tmpdir(); } catch { return path.dirname(fileURLToPath(import.meta.url)); }
};

const INDEX = '<!doctype html><title>Home</title>' + '<p>hello</p>'.repeat(200);
const DATA = JSON.stringify({ items: Array.from({ length: 200 }, (_, i) => ({ id: i })) });
const BIN = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
const PNG = Buffer.alloc(3000, 0x89);
const MTIME = 1714555815.734; // seconds, with milliseconds

const build = async (dir, spec) => {
  await mkdir(dir, { recursive: true });
  for (const [name, value] of Object.entries(spec)) {
    const p = path.join(dir, name);
    if (typeof value === 'string' || Buffer.isBuffer(value)) {
      await writeFile(p, value);
      await utimes(p, MTIME, MTIME);
    } else await build(p, value);
  }
};

/**
 * One fixture tree for the whole file (building it per test is slow on some
 * disks). Every test only reads it. The server is started per test and
 * closed in `finally`; the tree is removed by the last test.
 */
let fixture = null;
const getFixture = () => {
  fixture ??= (async () => {
    const base = await mkdtemp(path.join(await tmpBase(), 'static-'));
    const root = path.join(base, 'public');
    await build(root, {
      'index.html': INDEX,
      'app.js': 'console.log("hi");',
      'data.json': DATA,
      'logo.png': PNG,
      'README.TXT': 'read me',
      'video.bin': BIN,
      docs: { 'index.html': '<h1>Docs</h1>' },
      'empty-dir': {},
    });
    await build(path.join(base, 'public-old'), { 'secret.txt': 'TOP SECRET (sibling)' });
    await writeFile(path.join(base, 'secret.txt'), 'TOP SECRET (parent)');
    return { base, root };
  })();
  return fixture;
};

let ctx = null;
const withServer = async (fn) => {
  const { root } = await getFixture();
  const server = http.createServer(solution.createStaticHandler({ root }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  ctx = { root, port: server.address().port };
  try {
    return await fn(ctx);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
};

const request = (p, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: ctx.port, path: p, method, headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  });
  req.setTimeout(3000, () => req.destroy(new Error('the response never completed: does content-length match the bytes actually sent?')));
  req.on('error', reject);
  req.end();
});

const etagOf = async (file) => {
  const info = await stat(path.join(ctx.root, file));
  return `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
};

describe('static handler: files and types', () => {
  it('serves / as index.html with all the headers', () => withServer(async () => {
    const r = await request('/');
    expect(r.status).toBe(200);
    expect(r.body.toString()).toBe(INDEX);
    expect(r.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(r.headers['content-length']).toBe(String(Buffer.byteLength(INDEX)));
    expect(r.headers['content-encoding']).toBeUndefined();
    expect(r.headers.vary).toBe('Accept-Encoding');
    expect(r.headers['accept-ranges']).toBe('bytes');
    expect(r.headers.etag).toBe(await etagOf('index.html'));
    expect(r.headers['last-modified']).toBe('Wed, 01 May 2024 09:30:15 GMT');
  }));

  it('serves directory indexes and 404s what is not there', () => withServer(async () => {
    expect((await request('/docs')).body.toString()).toBe('<h1>Docs</h1>');
    expect((await request('/docs/?x=1')).body.toString()).toBe('<h1>Docs</h1>');
    const empty = await request('/empty-dir');
    expect(empty.status).toBe(404);
    expect(empty.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect((await request('/missing.html')).status).toBe(404);
    expect((await request('/app.js/extra')).status).toBe(404);
  }));

  it('picks content types by extension, case-insensitively', () => withServer(async () => {
    expect((await request('/app.js')).headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect((await request('/README.TXT')).headers['content-type']).toBe('text/plain; charset=utf-8');
    const png = await request('/logo.png');
    expect(png.headers['content-type']).toBe('image/png');
    expect(png.headers.vary).toBeUndefined();
    expect(png.body.equals(PNG)).toBe(true);
    expect((await request('/video.bin')).headers['content-type']).toBe('application/octet-stream');
    expect((await request('/data.json')).headers['content-type']).toBe('application/json');
  }));

  it('answers 405 to other methods', () => withServer(async () => {
    const r = await request('/index.html', { method: 'POST' });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe('GET, HEAD');
  }));
});

describe('static handler: path safety', () => {
  it('never serves anything outside root', () => withServer(async () => {
    for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/..%5csecret.txt',
      '/docs/..%5c..%5csecret.txt', '/docs/%2e%2e/%2e%2e/secret.txt', '/../public-old/secret.txt',
      '/%2e%2e/public-old/secret.txt', '/..%5cpublic-old%5csecret.txt']) {
      const r = await request(p);
      expect({ p, status: r.status, leaked: r.body.toString().includes('TOP SECRET') }).toEqual({ p, status: 404, leaked: false });
    }
  }));

  it('answers 400 for malformed encodings and NUL bytes', () => withServer(async () => {
    expect((await request('/%E0%A4%A')).status).toBe(400);
    expect((await request('/index.html%00.png')).status).toBe(400);
  }));
});

describe('static handler: conditional requests', () => {
  it('answers 304 to a matching If-None-Match, weak or not', () => withServer(async () => {
    const etag = await etagOf('app.js');
    const r = await request('/app.js', { headers: { 'if-none-match': etag } });
    expect(r.status).toBe(304);
    expect(r.body).toHaveLength(0);
    expect(r.headers.etag).toBe(etag);
    expect((await request('/app.js', { headers: { 'if-none-match': `"x", W/${etag}` } })).status).toBe(304);
    expect((await request('/app.js', { headers: { 'if-none-match': '*' } })).status).toBe(304);
  }));

  it('answers 304 to If-Modified-Since at second precision', () => withServer(async () => {
    const lm = (await request('/app.js')).headers['last-modified'];
    expect((await request('/app.js', { headers: { 'if-modified-since': lm } })).status).toBe(304);
    const earlier = 'Wed, 01 May 2024 09:30:14 GMT';
    expect((await request('/app.js', { headers: { 'if-modified-since': earlier } })).status).toBe(200);
  }));

  it('lets If-None-Match override If-Modified-Since', () => withServer(async () => {
    const lm = (await request('/app.js')).headers['last-modified'];
    const r = await request('/app.js', { headers: { 'if-none-match': '"stale"', 'if-modified-since': lm } });
    expect(r.status).toBe(200);
  }));
});

describe('static handler: ranges', () => {
  it('serves 206 with exact bytes for closed and suffix ranges', () => withServer(async () => {
    const a = await request('/video.bin', { headers: { range: 'bytes=10-19' } });
    expect(a.status).toBe(206);
    expect(a.headers['content-range']).toBe('bytes 10-19/1000');
    expect(a.headers['content-length']).toBe('10');
    expect(a.body.equals(BIN.subarray(10, 20))).toBe(true);
    const b = await request('/video.bin', { headers: { range: 'bytes=-5' } });
    expect(b.body.equals(BIN.subarray(995))).toBe(true);
  }));

  it('answers 416 and ignores ranges it will not honour', () => withServer(async () => {
    const r = await request('/video.bin', { headers: { range: 'bytes=1000-' } });
    expect(r.status).toBe(416);
    expect(r.headers['content-range']).toBe('bytes */1000');
    expect((await request('/video.bin', { headers: { range: 'bytes=0-1,4-5' } })).status).toBe(200);
    const stale = await request('/video.bin', { headers: { range: 'bytes=0-9', 'if-range': '"old"' } });
    expect(stale.status).toBe(200);
    expect(stale.body.equals(BIN)).toBe(true);
    const fresh = await request('/video.bin', { headers: { range: 'bytes=0-9', 'if-range': await etagOf('video.bin') } });
    expect(fresh.status).toBe(206);
  }));

  it('never compresses a range', () => withServer(async () => {
    const r = await request('/index.html', { headers: { range: 'bytes=0-14', 'accept-encoding': 'gzip' } });
    expect(r.status).toBe(206);
    expect(r.headers['content-encoding']).toBeUndefined();
    expect(r.body.toString()).toBe('<!doctype html>');
  }));
});

describe('static handler: compression', () => {
  it('gzips large compressible files with a weak ETag and no Content-Length', () => withServer(async () => {
    const r = await request('/index.html', { headers: { 'accept-encoding': 'gzip, deflate, br' } });
    expect(r.status).toBe(200);
    expect(r.headers['content-encoding']).toBe('gzip');
    expect(r.headers['content-length']).toBeUndefined();
    expect(r.headers.etag).toBe('W/' + (await etagOf('index.html')));
    expect(r.headers.vary).toBe('Accept-Encoding');
    expect(gunzipSync(r.body).toString()).toBe(INDEX);
    const json = await request('/data.json', { headers: { 'accept-encoding': '*' } });
    expect(json.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(json.body).toString()).toBe(DATA);
  }));

  it('revalidates the gzip variant with its weak ETag', () => withServer(async () => {
    const r = await request('/index.html', { headers: { 'accept-encoding': 'gzip', 'if-none-match': 'W/' + (await etagOf('index.html')) } });
    expect(r.status).toBe(304);
  }));

  it('does not gzip small, binary, or refused responses', () => withServer(async () => {
    expect((await request('/app.js', { headers: { 'accept-encoding': 'gzip' } })).headers['content-encoding']).toBeUndefined();
    expect((await request('/logo.png', { headers: { 'accept-encoding': 'gzip' } })).headers['content-encoding']).toBeUndefined();
    const refused = await request('/index.html', { headers: { 'accept-encoding': 'gzip;q=0, *' } });
    expect(refused.headers['content-encoding']).toBeUndefined();
    expect(refused.body.toString()).toBe(INDEX);
    const brOnly = await request('/index.html', { headers: { 'accept-encoding': 'br' } });
    expect(brOnly.headers['content-encoding']).toBeUndefined();
  }));
});

describe('static handler: HEAD', () => {
  it('sends the same headers with no body', () => withServer(async () => {
    const get = await request('/index.html');
    const head = await request('/index.html', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toHaveLength(0);
    for (const h of ['content-type', 'content-length', 'etag', 'last-modified', 'accept-ranges', 'vary']) {
      expect({ h, v: head.headers[h] }).toEqual({ h, v: get.headers[h] });
    }
    const ranged = await request('/video.bin', { method: 'HEAD', headers: { range: 'bytes=0-9' } });
    expect(ranged.status).toBe(206);
    expect(ranged.body).toHaveLength(0);
  }));
});

describe('static handler: teardown', () => {
  it('removes the fixture tree', async () => {
    const { base } = await getFixture();
    await rm(base, { recursive: true, force: true });
    fixture = null;
    expect(true).toBe(true);
  });
});
