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

export function createSseHandler({ feed, heartbeatMs = 15000, timers = { setInterval, clearInterval } }) {
  return (req, res) => {
    // TODO: GET /events -> event stream (headers flushed at once), Last-Event-ID
    // replay, live events, a heartbeat via `timers`, and cleanup on 'close'.
    // (This stub answers 501 so the tests fail fast instead of hanging.)
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  };
}
