import http from 'node:http';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (size = 32) => Buffer.concat([PNG_MAGIC, Buffer.alloc(size - 8, 7)]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PDF = Buffer.from('%PDF-1.7 hello', 'latin1');
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

const withApp = async (opts, fn) => {
  const { server } = solution.createAttachmentsApp({ authenticate: (req) => req.headers['x-user'] ?? null, ...opts });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  /** Starts a request and returns it unfinished, with a promise of the response. */
  const open = (method, path, headers = {}) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers });
    const response = new Promise((resolve, reject) => {
      req.on('response', (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let json;
          try { json = JSON.parse(raw.toString('utf8')); } catch {}
          resolve({ status: res.statusCode, headers: res.headers, raw, json });
        });
      });
      req.on('error', reject);
    });
    response.catch(() => {});
    return { req, response };
  };

  const call = async (method, path, { user, body, headers = {} } = {}) => {
    const h = { ...headers };
    if (user) h['x-user'] = user;
    if (body !== undefined && h['content-length'] === undefined) h['content-length'] = body.length;
    const { req, response } = open(method, path, h);
    req.end(body);
    return response;
  };

  const upload = (user, body, { name = 'file.png', type = 'image/png', headers = {} } = {}) =>
    call('POST', '/attachments', { user, body, headers: { 'x-filename': encodeURIComponent(name), 'content-type': type, ...headers } });

  try {
    await fn({ open, call, upload, port });
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
};

const pause = () => new Promise((r) => setTimeout(r, 20));

describe('upload and download', () => {
  it('stores a PNG and returns its summary', async () => {
    await withApp({}, async ({ upload, call }) => {
      const body = png(40);
      const r = await upload('alice', body, { name: 'Holiday.PNG' });
      expect(r.status).toBe(201);
      expect(r.headers['content-type']).toMatch(/application\/json/);
      expect(r.json.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(r.json).toEqual({ id: r.json.id, name: 'Holiday.PNG', type: 'image/png', size: 40 });

      const d = await call('GET', '/attachments/' + r.json.id, { user: 'alice' });
      expect(d.status).toBe(200);
      expect(Buffer.compare(d.raw, body)).toBe(0);
      expect(d.headers['content-type']).toBe('image/png');
      expect(d.headers['content-length']).toBe('40');
      expect(d.headers['content-disposition']).toBe('attachment; filename="Holiday.PNG"');
      expect(d.headers['x-content-type-options']).toBe('nosniff');
      expect(d.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    });
  });

  it('serves the sniffed type and a safe disposition for awkward names', async () => {
    await withApp({}, async ({ upload, call }) => {
      const r = await upload('alice', PDF, { name: 'C:\\Users\\me\\Résumé "final".pdf', type: 'application/octet-stream' });
      expect(r.status).toBe(201);
      expect(r.json.name).toBe('Résumé "final".pdf');
      expect(r.json.type).toBe('application/pdf');
      const d = await call('GET', '/attachments/' + r.json.id, { user: 'alice' });
      expect(d.headers['content-type']).toBe('application/pdf');
      expect(d.headers['content-disposition']).toBe(`attachment; filename="R_sum_ _final_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%22final%22.pdf`);
    });
  });

  it('lists only the caller\'s files, oldest first', async () => {
    await withApp({}, async ({ upload, call }) => {
      const a = (await upload('alice', png(), { name: 'a.png' })).json;
      await upload('bob', JPEG, { name: 'b.jpg', type: 'image/jpeg' });
      const c = (await upload('alice', JPEG, { name: 'c.jpeg', type: 'image/jpeg' })).json;
      const list = await call('GET', '/attachments', { user: 'alice' });
      expect(list.status).toBe(200);
      expect(list.json).toEqual([a, c]);
      expect((await call('GET', '/attachments', { user: 'carol' })).json).toEqual([]);
    });
  });

  it('hides other users\' files behind 404 and lets owners delete', async () => {
    await withApp({}, async ({ upload, call }) => {
      const { id } = (await upload('alice', png())).json;
      for (const method of ['GET', 'DELETE']) {
        const r = await call(method, '/attachments/' + id, { user: 'mallory' });
        expect(r.status).toBe(404);
        expect(r.json).toEqual({ error: 'not-found' });
      }
      expect((await call('GET', '/attachments/nope', { user: 'alice' })).status).toBe(404);
      const del = await call('DELETE', '/attachments/' + id, { user: 'alice' });
      expect(del.status).toBe(204);
      expect(del.raw.length).toBe(0);
      expect((await call('GET', '/attachments/' + id, { user: 'alice' })).status).toBe(404);
    });
  });
});

describe('routing and auth', () => {
  it('401s without a user on every attachments route', async () => {
    await withApp({}, async ({ call, upload }) => {
      expect((await call('GET', '/attachments')).json).toEqual({ error: 'unauthorized' });
      expect((await call('GET', '/attachments/abc')).status).toBe(401);
      expect((await call('DELETE', '/attachments/abc')).status).toBe(401);
      expect((await upload(undefined, png())).status).toBe(401);
    });
  });

  it('404s other paths before auth, and unknown methods after it', async () => {
    await withApp({}, async ({ call }) => {
      expect((await call('GET', '/elsewhere')).json).toEqual({ error: 'not-found' });
      expect((await call('GET', '/attachments/a/b')).status).toBe(404);
      expect((await call('PUT', '/attachments', { user: 'alice' })).status).toBe(404);
    });
  });
});

describe('upload checks', () => {
  it('411 for a chunked upload with no content-length', async () => {
    await withApp({}, async ({ open }) => {
      const { req, response } = open('POST', '/attachments', { 'x-user': 'alice', 'x-filename': 'a.png', 'content-type': 'image/png' });
      req.write(png());
      req.end();
      const r = await response;
      expect(r.status).toBe(411);
      expect(r.json).toEqual({ error: 'length-required' });
    });
  });

  it('413 too-large before the body is sent', async () => {
    await withApp({ maxBytes: 1000 }, async ({ open }) => {
      const { req, response } = open('POST', '/attachments', { 'x-user': 'alice', 'x-filename': 'a.png', 'content-type': 'image/png', 'content-length': 1001 });
      req.flushHeaders();
      // Nothing written: a server that waits for the body never answers.
      const r = await response;
      req.destroy();
      expect(r.status).toBe(413);
      expect(r.json).toEqual({ error: 'too-large' });
    });
  });

  it('accepts exactly maxBytes', async () => {
    await withApp({ maxBytes: 64 }, async ({ upload }) => {
      expect((await upload('alice', png(64))).status).toBe(201);
    });
  });

  it('400 for a malformed x-filename', async () => {
    await withApp({}, async ({ call }) => {
      const r = await call('POST', '/attachments', { user: 'alice', body: png(), headers: { 'x-filename': '%E0%A4%A', 'content-type': 'image/png' } });
      expect(r.status).toBe(400);
      expect(r.json).toEqual({ error: 'bad-request' });
    });
  });

  it('validates the bytes, the declared type and the extension', async () => {
    await withApp({}, async ({ upload }) => {
      const cases = [
        [HTML, 'invoice.pdf', 'application/pdf', 415, 'unsupported-type'],
        [Buffer.from('GIF89a......'), 'a.gif', 'image/gif', 415, 'unsupported-type'],
        [png(), 'a.png', 'image/jpeg', 415, 'type-mismatch'],
        [png(), 'a.png', 'text/html; charset=utf-8', 415, 'type-mismatch'],
        [png(), 'a.pdf', 'image/png', 415, 'extension-mismatch'],
        [png(), 'shell.png.php', 'image/png', 415, 'extension-mismatch'],
        [png(), '', 'image/png', 415, 'extension-mismatch'],
        [Buffer.alloc(0), 'a.png', 'image/png', 400, 'empty'],
      ];
      for (const [body, name, type, status, code] of cases) {
        const r = await upload('alice', body, { name, type });
        expect([name, type, r.status, r.json]).toEqual([name, type, status, { error: code }]);
      }
      expect((await upload('alice', png(), { name: '../../a.png', type: ' IMAGE/PNG ' })).json.name).toBe('a.png');
    });
  });
});

describe('per-user limits', () => {
  const startUpload = (open, user, length) => {
    const u = open('POST', '/attachments', { 'x-user': user, 'x-filename': 'slow.png', 'content-type': 'image/png', 'content-length': length });
    u.req.write(PNG_MAGIC); // headers and a first chunk; the rest comes later
    return u;
  };

  it('allows maxInFlight concurrent uploads per user', async () => {
    await withApp({ maxInFlight: 2 }, async ({ open, upload }) => {
      const a = startUpload(open, 'alice', 32);
      const b = startUpload(open, 'alice', 32);
      let third;
      for (let i = 0; i < 100; i++) {
        third = await upload('alice', png());
        if (third.status !== 201) break; // keep polling only while the slow uploads have not landed
        await pause();
      }
      expect(third.status).toBe(429);
      expect(third.json).toEqual({ error: 'too-many-in-flight' });
      expect((await upload('bob', png())).status).toBe(201);
      a.req.end(Buffer.alloc(24, 7));
      expect((await a.response).status).toBe(201);
      expect((await upload('alice', png())).status).toBe(201);
      b.req.end(Buffer.alloc(24, 7));
      expect((await b.response).status).toBe(201);
    });
  });

  it('frees the slots of uploads whose client disconnects', async () => {
    await withApp({ maxInFlight: 2 }, async ({ open, upload }) => {
      const a = startUpload(open, 'alice', 32);
      const b = startUpload(open, 'alice', 32);
      let r;
      for (let i = 0; i < 100; i++) {
        r = await upload('alice', png());
        if (r.status !== 201) break;
        await pause();
      }
      expect(r.status).toBe(429);
      a.req.destroy();
      b.req.destroy();
      for (let i = 0; i < 100; i++) {
        r = await upload('alice', png());
        if (r.status !== 429) break;
        await pause();
      }
      expect(r.status).toBe(201);
    });
  });

  it('enforces the storage quota, and deleting frees it', async () => {
    await withApp({ quotaBytes: 100, maxBytes: 100 }, async ({ upload, call }) => {
      const first = await upload('alice', png(60));
      expect(first.status).toBe(201);
      const r = await upload('alice', png(41));
      expect(r.status).toBe(413);
      expect(r.json).toEqual({ error: 'quota-exceeded' });
      expect((await upload('bob', png(100))).status).toBe(201);
      expect((await upload('alice', png(40))).status).toBe(201);
      await call('DELETE', '/attachments/' + first.json.id, { user: 'alice' });
      expect((await upload('alice', png(60))).status).toBe(201);
    });
  });

  it('counts uploads still in progress against the quota', async () => {
    await withApp({ quotaBytes: 100, maxBytes: 100, maxInFlight: 5 }, async ({ open, upload }) => {
      const slow = startUpload(open, 'alice', 60);
      // Probe with an invalid body: 415 (no state change) until the slow upload
      // has reached the server, then 413 because it is reserved.
      let r;
      for (let i = 0; i < 100; i++) {
        r = await upload('alice', Buffer.alloc(41, 0x41), { name: 'x.png' });
        if (r.status !== 415) break;
        await pause();
      }
      expect(r.json).toEqual({ error: 'quota-exceeded' });
      expect((await upload('alice', png(41))).json).toEqual({ error: 'quota-exceeded' });
      expect((await upload('alice', png(40))).status).toBe(201);
      slow.req.end(Buffer.alloc(52, 7));
      expect((await slow.response).status).toBe(201);
    });
  });

  it('gives the reservation back when an upload is rejected', async () => {
    await withApp({ quotaBytes: 100, maxBytes: 100, maxInFlight: 1 }, async ({ upload }) => {
      for (let i = 0; i < 3; i++) {
        expect((await upload('alice', Buffer.concat([HTML, Buffer.alloc(90 - HTML.length)]), { name: 'a.pdf', type: 'application/pdf' })).status).toBe(415);
      }
      expect((await upload('alice', png(90))).status).toBe(201);
    });
  });
});
