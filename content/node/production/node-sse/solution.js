import { EventEmitter } from 'node:events';

/** Given: an in-memory event log with ids and a live emitter. */
export function createFeed({ limit = 1000 } = {}) {
  const events = [];
  const emitter = new EventEmitter();
  let nextId = 1;
  return {
    emitter,
    publish(type, data) {
      const event = { id: nextId++, type, data };
      events.push(event);
      if (events.length > limit) events.shift();
      emitter.emit('event', event);
      return event;
    },
    since(lastId) {
      return events.filter((event) => event.id > lastId);
    },
  };
}

const format = (event) =>
  `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;

export function createSseHandler({ feed, heartbeatMs = 15000, timers = { setInterval, clearInterval } }) {
  return (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' || pathname !== '/events') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.flushHeaders();

    // Replay and subscribe in the same synchronous turn: nothing can be
    // published in between, so there is neither a gap nor a duplicate.
    const lastId = req.headers['last-event-id'];
    if (typeof lastId === 'string' && /^\d+$/.test(lastId)) {
      for (const event of feed.since(Number(lastId))) res.write(format(event));
    }

    const onEvent = (event) => res.write(format(event));
    feed.emitter.on('event', onEvent);
    const heartbeat = timers.setInterval(() => res.write(': ping\n\n'), heartbeatMs);

    // 'close' fires once, whether the client aborted or the server ended the response.
    req.on('close', () => {
      feed.emitter.off('event', onEvent);
      timers.clearInterval(heartbeat);
    });
  };
}
