import http from 'node:http';

/** Bounded poll for something that happens on another event (never a timing assertion). */
const until = async (cond, ms = 1000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 5));
  }
  return true;
};

const within = (promise, ms, message) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
};

/** Timers the test fires by hand. */
const fakeTimers = () => {
  const live = new Map();
  let n = 0;
  return {
    live,
    setInterval(fn, ms) { const handle = { n: ++n, ms }; live.set(handle, fn); return handle; },
    clearInterval(handle) { live.delete(handle); },
    fire() { for (const fn of [...live.values()]) fn(); },
  };
};

/** One SSE block -> { id, event, data, comments } (data joined by newlines, as EventSource does). */
const parseBlock = (block) => {
  const out = { comments: [] };
  const data = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) { out.comments.push(line.slice(1).trim()); continue; }
    const i = line.indexOf(':');
    const field = i < 0 ? line : line.slice(0, i);
    let value = i < 0 ? '' : line.slice(i + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'id' || field === 'event') out[field] = value;
  }
  if (data.length) out.data = data.join('\n');
  return out;
};

const start = async ({ heartbeatMs = 15000 } = {}) => {
  const feed = solution.createFeed();
  const timers = fakeTimers();
  const server = http.createServer(solution.createSseHandler({ feed, heartbeatMs, timers }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const clients = [];

  const connect = async (headers = {}) => {
    const ac = new AbortController();
    const res = await within(
      fetch(base + '/events', { headers, signal: ac.signal }),
      2000, 'no response headers within 2 s: send them straight away with res.flushHeaders()',
    );
    if (res.status !== 200) {
      ac.abort();
      throw new Error('GET /events answered ' + res.status + ', expected 200');
    }
    const blocks = [];
    let taken = 0;
    const client = {
      res, blocks,
      close: () => ac.abort(),
      /** The next block that carries data, skipping comments. */
      async nextEvent() {
        let found = -1;
        const ok = await until(() => {
          for (let i = taken; i < blocks.length; i++) if (blocks[i].data !== undefined) { found = i; return true; }
          return false;
        });
        if (!ok) throw new Error('no event arrived within 1 s');
        taken = found + 1;
        const { comments, ...event } = blocks[found];
        return event;
      },
      /** Every event received so far that has not been taken. */
      pending: () => blocks.slice(taken).filter((b) => b.data !== undefined),
    };
    clients.push(client);
    if (res.body) {
      (async () => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
            let i;
            while ((i = buffer.indexOf('\n\n')) >= 0) {
              blocks.push(parseBlock(buffer.slice(0, i)));
              buffer = buffer.slice(i + 2);
            }
          }
        } catch { /* aborted */ }
      })();
    }
    return client;
  };

  const close = () => {
    for (const c of clients) c.close();
    server.closeAllConnections();
    return new Promise((r) => server.close(r));
  };

  return { feed, timers, connect, base, close };
};

describe('the stream', () => {
  it('answers with an event stream straight away', async () => {
    const app = await start();
    try {
      const client = await app.connect();
      expect(client.res.status).toBe(200);
      expect(client.res.headers.get('content-type')).toMatch(/^text\/event-stream/);
      expect(client.res.headers.get('cache-control')).toBe('no-cache');
    } finally { await app.close(); }
  });

  it('404s other paths and methods', async () => {
    const app = await start();
    try {
      const other = await fetch(app.base + '/nope');
      expect(other.status).toBe(404);
      expect(await other.json()).toEqual({ error: 'not found' });
      expect((await fetch(app.base + '/events', { method: 'POST' })).status).toBe(404);
    } finally { await app.close(); }
  });

  it('delivers published events in the wire format', async () => {
    const app = await start();
    try {
      const client = await app.connect();
      expect(await until(() => app.feed.emitter.listenerCount('event') === 1)).toBe(true);
      app.feed.publish('order.created', { orderId: 'A-1', note: 'two\nlines' });
      app.feed.publish('order.paid', { orderId: 'A-1', total: 1250 });
      expect(await client.nextEvent()).toEqual({ id: '1', event: 'order.created', data: '{"orderId":"A-1","note":"two\\nlines"}' });
      const second = await client.nextEvent();
      expect(second.id).toBe('2');
      expect(second.event).toBe('order.paid');
      expect(JSON.parse(second.data)).toEqual({ orderId: 'A-1', total: 1250 });
    } finally { await app.close(); }
  });

  it('sends only events published after connecting', async () => {
    const app = await start();
    try {
      app.feed.publish('old', { n: 1 });
      app.feed.publish('old', { n: 2 });
      const client = await app.connect();
      expect(await until(() => app.feed.emitter.listenerCount('event') === 1)).toBe(true);
      app.feed.publish('new', { n: 3 });
      expect((await client.nextEvent()).id).toBe('3');
      expect(client.blocks.filter((b) => b.event === 'old')).toEqual([]);
    } finally { await app.close(); }
  });

  it('fans out to every connected client', async () => {
    const app = await start();
    try {
      const one = await app.connect();
      const two = await app.connect();
      expect(await until(() => app.feed.emitter.listenerCount('event') === 2)).toBe(true);
      app.feed.publish('tick', 1);
      expect((await one.nextEvent()).data).toBe('1');
      expect((await two.nextEvent()).data).toBe('1');
    } finally { await app.close(); }
  });
});

describe('resuming', () => {
  it('replays what was missed after Last-Event-ID, then continues live', async () => {
    const app = await start();
    try {
      for (let n = 1; n <= 4; n++) app.feed.publish('n', n);
      const client = await app.connect({ 'last-event-id': '2' });
      expect((await client.nextEvent()).id).toBe('3');
      expect((await client.nextEvent()).id).toBe('4');
      expect(await until(() => app.feed.emitter.listenerCount('event') === 1)).toBe(true);
      app.feed.publish('n', 5);
      expect((await client.nextEvent()).id).toBe('5');
      expect(client.pending()).toEqual([]);
    } finally { await app.close(); }
  });

  it('replays nothing when already up to date, and everything from 0', async () => {
    const app = await start();
    try {
      for (let n = 1; n <= 3; n++) app.feed.publish('n', n);
      const upToDate = await app.connect({ 'last-event-id': '3' });
      const fromZero = await app.connect({ 'last-event-id': '0' });
      expect(await until(() => app.feed.emitter.listenerCount('event') === 2)).toBe(true);
      app.feed.publish('n', 4);
      expect((await upToDate.nextEvent()).id).toBe('4');
      expect([(await fromZero.nextEvent()).id, (await fromZero.nextEvent()).id, (await fromZero.nextEvent()).id, (await fromZero.nextEvent()).id])
        .toEqual(['1', '2', '3', '4']);
    } finally { await app.close(); }
  });

  it('ignores a Last-Event-ID that is not a plain integer', async () => {
    const app = await start();
    try {
      for (let n = 1; n <= 3; n++) app.feed.publish('n', n);
      const clients = [];
      for (const id of ['abc', '-1', '1.5', '']) clients.push(await app.connect({ 'last-event-id': id }));
      expect(await until(() => app.feed.emitter.listenerCount('event') === 4)).toBe(true);
      app.feed.publish('n', 4);
      for (const c of clients) {
        expect((await c.nextEvent()).id).toBe('4');
        expect(c.blocks.filter((b) => b.data !== undefined).map((b) => b.id)).toEqual(['4']);
      }
    } finally { await app.close(); }
  });
});

describe('heartbeat', () => {
  it('schedules one heartbeat per connection with the injected timers', async () => {
    const app = await start({ heartbeatMs: 1234 });
    try {
      await app.connect();
      expect(await until(() => app.timers.live.size === 1)).toBe(true);
      expect([...app.timers.live.keys()][0].ms).toBe(1234);
    } finally { await app.close(); }
  });

  it('writes a ping comment when it fires', async () => {
    const app = await start();
    try {
      const client = await app.connect();
      expect(await until(() => app.timers.live.size === 1)).toBe(true);
      app.timers.fire();
      app.timers.fire();
      expect(await until(() => client.blocks.filter((b) => b.comments.includes('ping')).length === 2)).toBe(true);
      // A comment is not an event.
      expect(client.pending()).toEqual([]);
    } finally { await app.close(); }
  });
});

describe('cleanup', () => {
  it('unsubscribes and stops the heartbeat when the client disconnects', async () => {
    const app = await start();
    try {
      const before = app.feed.emitter.listenerCount('event');
      const client = await app.connect();
      expect(await until(() => app.feed.emitter.listenerCount('event') === before + 1)).toBe(true);
      expect(await until(() => app.timers.live.size === 1)).toBe(true);
      client.close();
      expect(await until(() => app.feed.emitter.listenerCount('event') === before)).toBe(true);
      expect(await until(() => app.timers.live.size === 0)).toBe(true);
      expect(() => app.feed.publish('after', {})).not.toThrow();
    } finally { await app.close(); }
  });

  it('only cleans up the client that left', async () => {
    const app = await start();
    try {
      const leaving = await app.connect();
      const staying = await app.connect();
      expect(await until(() => app.feed.emitter.listenerCount('event') === 2)).toBe(true);
      leaving.close();
      expect(await until(() => app.feed.emitter.listenerCount('event') === 1)).toBe(true);
      expect(app.timers.live.size).toBe(1);
      app.feed.publish('still', 'here');
      expect((await staying.nextEvent()).data).toBe('"here"');
    } finally { await app.close(); }
  });

  it('does not leak across many short-lived connections', async () => {
    const app = await start();
    try {
      for (let i = 0; i < 20; i++) {
        const c = await app.connect();
        c.close();
      }
      expect(await until(() => app.feed.emitter.listenerCount('event') === 0)).toBe(true);
      expect(await until(() => app.timers.live.size === 0)).toBe(true);
    } finally { await app.close(); }
  });
});
