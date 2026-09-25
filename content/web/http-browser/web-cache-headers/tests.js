import http from 'node:http';

const ASSETS = {
  '/': { body: '<!doctype html><script src="/assets/app.3f9a1c2b.js"></script>', type: 'text/html; charset=utf-8' },
  '/about.html': { body: '<h1>About</h1>', type: 'text/html; charset=utf-8' },
  '/assets/app.3f9a1c2b.js': { body: 'console.log("app")', type: 'text/javascript' },
  '/assets/index-4f3a9c1e7b.css': { body: 'body{margin:0}', type: 'text/css' },
  '/assets/chunk.3f9a.js': { body: 'short hash', type: 'text/javascript' },
  '/assets/app.js': { body: 'unhashed', type: 'text/javascript' },
  '/logo.png': { body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]), type: 'image/png' },
  '/menu.txt': { body: 'café crème', type: 'text/plain; charset=utf-8' },
  '/copy.txt': { body: 'café crème', type: 'text/plain; charset=utf-8' },
};

const request = (port, method, path, headers = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  });
  req.on('error', reject);
  req.end();
});

const withServer = async (fn, assets = ASSETS) => {
  const server = http.createServer(solution.createAssetHandler(assets));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn((method, path, headers) => request(server.address().port, method, path, headers));
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
};

describe('serving', () => {
  it('serves an asset with type, byte length and a strong ETag', async () => {
    await withServer(async (send) => {
      const res = await send('GET', '/menu.txt');
      expect(res.status).toBe(200);
      expect(res.body.toString('utf8')).toBe('café crème');
      expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(res.headers['content-length']).toBe('12');
      expect(res.headers.etag).toMatch(/^"[^"]+"$/);
    });
  });

  it('serves binary bodies byte for byte', async () => {
    await withServer(async (send) => {
      const res = await send('GET', '/logo.png');
      expect([...res.body]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
      expect(res.headers['content-length']).toBe('6');
    });
  });

  it('ignores the query string when looking an asset up', async () => {
    await withServer(async (send) => {
      const res = await send('GET', '/assets/app.3f9a1c2b.js?v=2');
      expect(res.status).toBe(200);
      expect(res.body.toString()).toBe('console.log("app")');
    });
  });

  it('404s an unknown path with no-store', async () => {
    await withServer(async (send) => {
      const res = await send('GET', '/assets/app.00000000.js');
      expect(res.status).toBe(404);
      expect(res.body.toString()).toBe('not found');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-type']).toBe('text/plain');
    });
  });

  it('405s other methods with an Allow header', async () => {
    await withServer(async (send) => {
      for (const method of ['POST', 'DELETE']) {
        const res = await send(method, '/menu.txt');
        expect(res.status).toBe(405);
        expect(res.headers.allow).toBe('GET, HEAD');
        expect(res.body.length).toBe(0);
      }
    });
  });

  it('answers HEAD with the GET headers and no body', async () => {
    await withServer(async (send) => {
      const get = await send('GET', '/menu.txt');
      const head = await send('HEAD', '/menu.txt');
      expect(head.status).toBe(200);
      expect(head.body.length).toBe(0);
      expect(head.headers['content-length']).toBe('12');
      expect(head.headers.etag).toBe(get.headers.etag);
      expect(head.headers['cache-control']).toBe(get.headers['cache-control']);
    });
  });
});

describe('ETags', () => {
  it('are stable, equal for equal bodies and different for different ones', async () => {
    await withServer(async (send) => {
      const a1 = (await send('GET', '/menu.txt')).headers.etag;
      const a2 = (await send('GET', '/menu.txt')).headers.etag;
      const copy = (await send('GET', '/copy.txt')).headers.etag;
      const other = (await send('GET', '/about.html')).headers.etag;
      expect(a1).toBe(a2);
      expect(copy).toBe(a1);
      expect(other).not.toBe(a1);
      expect(a1.startsWith('W/')).toBe(false);
    });
  });

  it('change when the content changes', async () => {
    let first;
    await withServer(async (send) => { first = (await send('GET', '/app.js')).headers.etag; },
      { '/app.js': { body: 'v1', type: 'text/javascript' } });
    await withServer(async (send) => { expect((await send('GET', '/app.js')).headers.etag).not.toBe(first); },
      { '/app.js': { body: 'v2', type: 'text/javascript' } });
  });
});

describe('cache-control', () => {
  it('caches fingerprinted files forever', async () => {
    await withServer(async (send) => {
      for (const path of ['/assets/app.3f9a1c2b.js', '/assets/index-4f3a9c1e7b.css']) {
        expect((await send('GET', path)).headers['cache-control']).toBe('public, max-age=31536000, immutable');
      }
    });
  });

  it('makes HTML revalidate every time', async () => {
    await withServer(async (send) => {
      expect((await send('GET', '/')).headers['cache-control']).toBe('no-cache');
      expect((await send('GET', '/about.html')).headers['cache-control']).toBe('no-cache');
    });
  });

  it('gives a short lifetime to anything else, including short or missing hashes', async () => {
    await withServer(async (send) => {
      for (const path of ['/assets/chunk.3f9a.js', '/assets/app.js', '/logo.png']) {
        expect((await send('GET', path)).headers['cache-control']).toBe('public, max-age=3600');
      }
    });
  });
});

describe('conditional requests', () => {
  it('answers 304 with no body when the ETag matches', async () => {
    await withServer(async (send) => {
      const first = await send('GET', '/');
      const again = await send('GET', '/', { 'if-none-match': first.headers.etag });
      expect(again.status).toBe(304);
      expect(again.body.length).toBe(0);
      expect(again.headers.etag).toBe(first.headers.etag);
      expect(again.headers['cache-control']).toBe('no-cache');
    });
  });

  it('matches within a list and ignores the weak prefix', async () => {
    await withServer(async (send) => {
      const { etag } = (await send('GET', '/menu.txt')).headers;
      expect((await send('GET', '/menu.txt', { 'if-none-match': `"old", ${etag}` })).status).toBe(304);
      expect((await send('GET', '/menu.txt', { 'if-none-match': `W/${etag}` })).status).toBe(304);
      expect((await send('HEAD', '/menu.txt', { 'if-none-match': etag })).status).toBe(304);
    });
  });

  it('answers 304 for If-None-Match: *', async () => {
    await withServer(async (send) => {
      expect((await send('GET', '/menu.txt', { 'if-none-match': '*' })).status).toBe(304);
    });
  });

  it('answers 200 with the body when nothing matches', async () => {
    await withServer(async (send) => {
      const { etag } = (await send('GET', '/menu.txt')).headers;
      const res = await send('GET', '/menu.txt', { 'if-none-match': `"stale", W/"older"` });
      expect(res.status).toBe(200);
      expect(res.body.toString()).toBe('café crème');
      // A tag that merely contains the real one is not a match.
      const inside = etag.slice(0, -1) + 'x"';
      expect((await send('GET', '/menu.txt', { 'if-none-match': inside })).status).toBe(200);
      expect((await send('GET', '/about.html', { 'if-none-match': etag })).status).toBe(200);
    });
  });
});
