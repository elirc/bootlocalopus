import http from 'node:http';

const within = (promise, ms, message) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
};
const tick = () => new Promise((r) => setImmediate(r));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls `check` until it is true; fails with `message` after `ms`. */
const eventually = async (check, ms, message) => {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(message);
    await pause(10);
  }
};

const withServer = async (getRows, fn) => {
  const server = http.createServer(solution.createExportHandler(getRows));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
};

/** A cursor over `rows` that records how far it was read and whether it was closed. */
const cursor = (rows, { failAfter = -1, gateAfter = -1, gate } = {}) => {
  const log = { pulled: 0, closed: false };
  const getRows = () => (async function* () {
    try {
      for (let i = 0; i < rows.length; i++) {
        if (i === gateAfter) await gate;
        if (i === failAfter) throw new Error('connection to database lost');
        log.pulled++;
        yield rows[i];
      }
    } finally {
      log.closed = true;
    }
  })();
  return { getRows, log };
};

/** An endless cursor of ~10 KB rows. */
const endless = () => {
  const log = { pulled: 0, closed: false };
  const pad = 'x'.repeat(10000);
  const getRows = () => (async function* () {
    try {
      for (let i = 0; ; i++) {
        log.pulled++;
        if (i % 50 === 0) await tick();
        yield { id: i, pad };
      }
    } finally {
      log.closed = true;
    }
  })();
  return { getRows, log };
};

describe('GET /export', () => {
  it('returns every row as one JSON array, and closes the cursor', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, total: i * 3, note: i % 7 ? null : 'a,b]"c' }));
    const { getRows, log } = cursor(rows);
    await withServer(getRows, async (base) => {
      const res = await fetch(`${base}/export`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/^application\/json/);
      expect(JSON.parse(await res.text())).toEqual(rows);
      await eventually(() => log.closed, 2000, 'the cursor was not closed');
    });
  });

  it('returns [] for no rows', async () => {
    const { getRows } = cursor([]);
    await withServer(getRows, async (base) => {
      const res = await fetch(`${base}/export`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('[]');
    });
  });

  it('streams: the first rows arrive before the source has finished', async () => {
    let open;
    const gate = new Promise((r) => { open = r; });
    const rows = Array.from({ length: 6 }, (_, i) => ({ id: i + 1 }));
    const { getRows, log } = cursor(rows, { gateAfter: 3, gate });
    await withServer(getRows, async (base) => {
      const res = await within(fetch(`${base}/export`), 3000, 'no response headers while the source was still open');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (!text.includes('{"id":3}')) {
        const { value, done } = await within(reader.read(), 3000, 'the first rows were not sent before the source finished');
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      expect(text.startsWith('[{"id":1},{"id":2},{"id":3}')).toBe(true);
      expect(log.pulled).toBe(3);
      open();
      for (;;) {
        const { value, done } = await within(reader.read(), 3000, 'the rest never arrived');
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      expect(JSON.parse(text)).toEqual(rows);
    });
  });

  it('closes the cursor when the client disconnects', async () => {
    const { getRows, log } = endless();
    await withServer(getRows, async (base) => {
      await new Promise((resolve, reject) => {
        const req = http.get(`${base}/export`, (res) => {
          if (res.statusCode !== 200) {
            req.destroy();
            reject(new Error(`expected 200, got ${res.statusCode}`));
            return;
          }
          res.once('data', () => {
            req.destroy(); // the user closed the tab
            resolve();
          });
        });
        req.on('error', () => {});
        setTimeout(() => reject(new Error('no data arrived')), 3000);
      });
      await eventually(() => log.closed, 3000, 'the cursor was never closed after the client disconnected');
      const pulledAtClose = log.pulled;
      await pause(50);
      expect(log.pulled).toBe(pulledAtClose);
    });
  });

  it('stops pulling rows while the client is not reading (backpressure)', async () => {
    const { getRows, log } = endless();
    await withServer(getRows, async (base) => {
      let req;
      await new Promise((resolve, reject) => {
        req = http.get(`${base}/export`, (res) => {
          if (res.statusCode !== 200) {
            req.destroy();
            reject(new Error(`expected 200, got ${res.statusCode}`));
            return;
          }
          res.pause(); // a client that is not reading
          resolve();
        });
        req.on('error', () => {});
      });
      // Socket buffers fill up, then the server must stop reading the cursor.
      let last = -1;
      let stableFor = 0;
      while (stableFor < 10 && log.pulled < 3000) {
        await pause(20);
        stableFor = log.pulled === last ? stableFor + 1 : 0;
        last = log.pulled;
      }
      expect(log.pulled).toBeLessThan(3000); // 3000 rows = 30 MB buffered for one slow client
      req.destroy();
      await eventually(() => log.closed, 3000, 'the cursor was never closed');
    });
  });

  it('answers 500 when the source fails before its first row', async () => {
    const { getRows } = cursor([{ id: 1 }], { failAfter: 0 });
    await withServer(getRows, async (base) => {
      const res = await fetch(`${base}/export`);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'export failed' });
    });
  });

  it('breaks the transfer instead of faking a complete array when the source fails mid-way', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }));
    const { getRows, log } = cursor(rows, { failAfter: 20 });
    await withServer(getRows, async (base) => {
      let text = null;
      try {
        // Either the headers arrive and the body breaks, or the connection dies
        // before the headers: both are honest failures.
        const res = await within(fetch(`${base}/export`), 3000, 'HUNG: no response and no disconnect');
        expect(res.status).toBe(200);
        text = await within(res.text(), 3000, 'HUNG: the response was never ended or destroyed');
      } catch (e) {
        if (String(e.message).startsWith('HUNG')) throw e;
        text = null; // the transfer broke: this is what we want
      }
      if (text !== null) {
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { /* not valid JSON: fine */ }
        expect(parsed).toBeNull();
      }
      expect(log.closed).toBe(true);
    });
  });

  it('answers 404 for other routes', async () => {
    const { getRows, log } = cursor([{ id: 1 }]);
    await withServer(getRows, async (base) => {
      const res = await fetch(`${base}/orders`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not found' });
      const post = await fetch(`${base}/export`, { method: 'POST' });
      expect(post.status).toBe(404);
      expect(log.pulled).toBe(0);
    });
  });
});
