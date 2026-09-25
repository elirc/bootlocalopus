import http from 'node:http';

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

const content = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251)); // bytes where position matters

const withServer = async (files, fn) => {
  const server = http.createServer(solution.createFileHandler(files));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
};

describe('parseRange', () => {
  const p = (h, size = 1000) => solution.parseRange(h, size);

  it('parses closed, open-ended and suffix ranges', () => {
    expect(p('bytes=0-99')).toEqual({ start: 0, end: 99 });
    expect(p('bytes=500-500')).toEqual({ start: 500, end: 500 });
    expect(p('bytes=900-')).toEqual({ start: 900, end: 999 });
    expect(p('bytes=-100')).toEqual({ start: 900, end: 999 });
  });

  it('clamps an end past the file, and a suffix longer than the file', () => {
    expect(p('bytes=900-5000')).toEqual({ start: 900, end: 999 });
    expect(p('bytes=-5000')).toEqual({ start: 0, end: 999 });
    expect(p('bytes=0-')).toEqual({ start: 0, end: 999 });
  });

  it('reports ranges that cannot be satisfied', () => {
    expect(p('bytes=1000-')).toBe('unsatisfiable');
    expect(p('bytes=1000-2000')).toBe('unsatisfiable');
    expect(p('bytes=-0')).toBe('unsatisfiable');
    expect(p('bytes=0-10', 0)).toBe('unsatisfiable');
    expect(p('bytes=-10', 0)).toBe('unsatisfiable');
  });

  it('ignores missing, foreign, malformed and multiple ranges', () => {
    for (const h of [undefined, '', 'items=0-10', 'bytes=', 'bytes=-', 'bytes=abc-10', 'bytes=5-2',
      'bytes=0-10,20-30', 'bytes= 0-10', 'bytes=1.5-3', 'bytes=0x10-20']) {
      expect({ h, r: p(h) }).toEqual({ h, r: null });
    }
  });
});

describe('createFileHandler', () => {
  const files = { '/movie.bin': content };

  it('serves the whole file with Accept-Ranges and an ETag', () => withServer(files, async (base) => {
    const r = await request(base, '/movie.bin');
    expect(r.status).toBe(200);
    expect(r.headers['accept-ranges']).toBe('bytes');
    expect(r.headers.etag).toMatch(/^"[^"]+"$/);
    expect(r.body.equals(content)).toBe(true);
  }));

  it('serves a range as 206 with Content-Range and the exact bytes', () => withServer(files, async (base) => {
    const r = await request(base, '/movie.bin', { range: 'bytes=100-199' });
    expect(r.status).toBe(206);
    expect(r.headers['content-range']).toBe('bytes 100-199/1000');
    expect(r.headers['content-length']).toBe('100');
    expect(r.headers['accept-ranges']).toBe('bytes');
    expect(r.body.equals(content.subarray(100, 200))).toBe(true);
  }));

  it('serves suffix and clamped ranges', () => withServer(files, async (base) => {
    const tail = await request(base, '/movie.bin', { range: 'bytes=-10' });
    expect(tail.status).toBe(206);
    expect(tail.headers['content-range']).toBe('bytes 990-999/1000');
    expect(tail.body.equals(content.subarray(990))).toBe(true);
    const clamped = await request(base, '/movie.bin', { range: 'bytes=995-2000' });
    expect(clamped.headers['content-range']).toBe('bytes 995-999/1000');
    expect(clamped.body).toHaveLength(5);
  }));

  it('answers 416 with bytes */size for an unsatisfiable range', () => withServer(files, async (base) => {
    const r = await request(base, '/movie.bin', { range: 'bytes=1000-' });
    expect(r.status).toBe(416);
    expect(r.headers['content-range']).toBe('bytes */1000');
    expect(r.body).toHaveLength(0);
  }));

  it('serves the full file for a range it will not honour', () => withServer(files, async (base) => {
    const r = await request(base, '/movie.bin', { range: 'bytes=0-1,5-6' });
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1000);
  }));

  it('honours If-Range only while the ETag still matches', () => withServer(files, async (base) => {
    const { headers } = await request(base, '/movie.bin');
    const same = await request(base, '/movie.bin', { range: 'bytes=500-', 'if-range': headers.etag });
    expect(same.status).toBe(206);
    expect(same.body.equals(content.subarray(500))).toBe(true);
    const changed = await request(base, '/movie.bin', { range: 'bytes=500-', 'if-range': '"an-older-version"' });
    expect(changed.status).toBe(200);
    expect(changed.body.equals(content)).toBe(true);
    const weak = await request(base, '/movie.bin', { range: 'bytes=500-', 'if-range': `W/${headers.etag}` });
    expect(weak.status).toBe(200);
  }));

  it('answers 404 for unknown files', () => withServer(files, async (base) => {
    expect((await request(base, '/other.bin', { range: 'bytes=0-1' })).status).toBe(404);
  }));
});
