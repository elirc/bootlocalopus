import http from 'node:http';

const APP = 'https://app.example.com';
const ADMIN = 'https://admin.example.com';

/** A handler that records calls and answers like a small API. */
const makeApi = () => {
  const calls = [];
  const handler = (req, res) => {
    calls.push(`${req.method} ${req.url}`);
    if (req.url === '/boom') {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"internal"}');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json', 'x-total-count': '3' });
    res.end('{"ok":true}');
  };
  return { calls, handler };
};

/** Raw request, so the test controls Origin and every other header. */
const request = (port, method, path, headers = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', reject);
  req.end();
});

const withServer = async (options, fn) => {
  const api = makeApi();
  const server = http.createServer(solution.withCors(options, api.handler));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn((method, path, headers) => request(server.address().port, method, path, headers), api.calls);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
};

const varyIncludesOrigin = (headers) =>
  (headers.vary ?? '').split(',').map((v) => v.trim().toLowerCase()).includes('origin');

describe('simple requests', () => {
  it('echoes an allowed origin and still runs the handler', async () => {
    await withServer({ origins: [APP, ADMIN] }, async (send, calls) => {
      const res = await send('GET', '/items', { origin: ADMIN });
      expect(res.status).toBe(200);
      expect(res.body).toBe('{"ok":true}');
      expect(res.headers['access-control-allow-origin']).toBe(ADMIN);
      expect(varyIncludesOrigin(res.headers)).toBe(true);
      expect(calls).toEqual(['GET /items']);
    });
  });

  it('adds credentials and exposed headers only when configured', async () => {
    await withServer({ origins: [APP] }, async (send) => {
      const res = await send('GET', '/items', { origin: APP });
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
      expect(res.headers['access-control-expose-headers']).toBeUndefined();
    });
    await withServer({ origins: [APP], credentials: true, exposeHeaders: ['X-Total-Count', 'ETag'] }, async (send) => {
      const res = await send('GET', '/items', { origin: APP });
      expect(res.headers['access-control-allow-origin']).toBe(APP);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-expose-headers']).toBe('X-Total-Count, ETag');
    });
  });

  it('keeps the CORS headers on the handler\'s error responses', async () => {
    await withServer({ origins: [APP], credentials: true }, async (send) => {
      const res = await send('GET', '/boom', { origin: APP });
      expect(res.status).toBe(500);
      expect(res.headers['access-control-allow-origin']).toBe(APP);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  it('passes unknown and missing origins through without CORS headers', async () => {
    await withServer({ origins: [APP], credentials: true }, async (send, calls) => {
      for (const headers of [{ origin: 'https://evil.io' }, {}]) {
        const res = await send('POST', '/items', headers);
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
        expect(res.headers['access-control-allow-credentials']).toBeUndefined();
        expect(varyIncludesOrigin(res.headers)).toBe(true);
      }
      expect(calls).toEqual(['POST /items', 'POST /items']);
    });
  });

  it('matches origins exactly: no prefixes, suffixes, other schemes or ports', async () => {
    await withServer({ origins: [APP] }, async (send) => {
      for (const origin of [
        'https://app.example.com.evil.io',
        'https://evil-app.example.com',
        'http://app.example.com',
        'https://app.example.com:8443',
        'https://APP.example.com',
        'null',
      ]) {
        const res = await send('GET', '/items', { origin });
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      }
    });
  });

  it('never allows the null origin, even if configured', async () => {
    await withServer({ origins: [APP, 'null'] }, async (send) => {
      const res = await send('GET', '/items', { origin: 'null' });
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});

describe('preflight', () => {
  const options = {
    origins: [APP],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600,
  };

  it('answers an allowed preflight itself with 204', async () => {
    await withServer(options, async (send, calls) => {
      const res = await send('OPTIONS', '/items/1', {
        origin: APP,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type, authorization',
      });
      expect(res.status).toBe(204);
      expect(res.body).toBe('');
      expect(res.headers['access-control-allow-origin']).toBe(APP);
      expect(res.headers['access-control-allow-methods']).toBe('GET, POST, PUT, DELETE');
      expect(res.headers['access-control-allow-headers']).toBe('Content-Type, Authorization');
      expect(res.headers['access-control-max-age']).toBe('3600');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(varyIncludesOrigin(res.headers)).toBe(true);
      expect(calls).toEqual([]);
    });
  });

  it('uses the defaults: max-age 600, no allow-headers, no credentials', async () => {
    await withServer({ origins: [APP] }, async (send) => {
      const res = await send('OPTIONS', '/x', { origin: APP, 'access-control-request-method': 'POST' });
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-methods']).toBe('GET, HEAD, POST');
      expect(res.headers['access-control-max-age']).toBe('600');
      expect(res.headers['access-control-allow-headers']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });

  it('refuses a preflight from an origin that is not allowed', async () => {
    await withServer(options, async (send, calls) => {
      const res = await send('OPTIONS', '/items', { origin: 'https://evil.io', 'access-control-request-method': 'GET' });
      expect(res.status).toBe(403);
      expect(res.body).toBe('');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-methods']).toBeUndefined();
      expect(calls).toEqual([]);
    });
  });

  it('refuses a method that is not configured', async () => {
    await withServer(options, async (send) => {
      const res = await send('OPTIONS', '/items', { origin: APP, 'access-control-request-method': 'PATCH' });
      expect(res.status).toBe(403);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  it('refuses when any requested header is not allowed', async () => {
    await withServer(options, async (send) => {
      const res = await send('OPTIONS', '/items', {
        origin: APP,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-debug',
      });
      expect(res.status).toBe(403);
      expect(res.headers['access-control-allow-headers']).toBeUndefined();
    });
  });

  it('compares requested headers case-insensitively and tolerates spacing', async () => {
    await withServer(options, async (send) => {
      const res = await send('OPTIONS', '/items', {
        origin: APP,
        'access-control-request-method': 'post',
        'access-control-request-headers': ' AUTHORIZATION ,Content-Type, ',
      });
      expect(res.status).toBe(204);
    });
  });

  it('passes a plain OPTIONS (no Access-Control-Request-Method) to the handler', async () => {
    await withServer(options, async (send, calls) => {
      const res = await send('OPTIONS', '/items', { origin: APP });
      expect(res.status).toBe(200);
      expect(calls).toEqual(['OPTIONS /items']);
      expect(res.headers['access-control-allow-origin']).toBe(APP);
    });
  });
});
