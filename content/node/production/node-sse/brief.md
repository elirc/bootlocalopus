Polling `/notifications` every two seconds is a thousand requests a minute
per open tab, almost all of them answering "nothing new". **Server-Sent
Events** keep one HTTP response open and write to it whenever something
happens. It is plain HTTP — no protocol upgrade, works through most proxies —
and the browser's `EventSource` reconnects on its own, sending the last id it
saw so the server can fill the gap.

The wire format is text. Each event is a block of `field: value` lines ended
by a blank line; a line starting with `:` is a comment:

```
id: 42
event: order.created
data: {"orderId":"A-1"}

: ping

```

The bug that ships with every first SSE endpoint is the **leak**: each
connection subscribes a listener, the client closes the tab, and the listener
stays subscribed forever, writing into a dead socket. A week later the process
has 40,000 listeners and a `MaxListenersExceededWarning` in the logs.

## Task

`createFeed()` is given: `feed.publish(type, data)` stores and returns
`{ id, type, data }` (ids are 1, 2, 3, …), `feed.since(lastId)` returns the
stored events with `id > lastId` in order, and `feed.emitter` emits `'event'`
with each published event.

Export `createSseHandler({ feed, heartbeatMs = 15000, timers = { setInterval, clearInterval } })`
returning a `(req, res)` handler:

- Anything but `GET /events` → `404` `{"error":"not found"}`.
- `GET /events` answers `200` with `content-type: text/event-stream` and
  `cache-control: no-cache`, and **sends the headers immediately**
  (`res.flushHeaders()`): a client must see the response before the first
  event, which may be minutes away.
- Each event is written as exactly
  `id: <id>\nevent: <type>\ndata: <JSON.stringify(data)>\n\n`.
- **Resume**: if the `Last-Event-ID` request header is a non-negative decimal
  integer, first write every `feed.since(thatId)` event, then continue live —
  with no gap and no duplicate between the two. Any other value is ignored
  (live only). Without the header, only events published after connecting are
  sent.
- **Heartbeat**: `timers.setInterval(fn, heartbeatMs)` where `fn` writes the
  comment `: ping\n\n`. Idle connections are otherwise killed by proxies. Use
  the injected `timers`, not the globals — the grader fires them by hand.
- **Cleanup**: when the client goes away (`req.on('close')`), remove your
  `'event'` listener from `feed.emitter` and `timers.clearInterval` your
  heartbeat. The grader aborts a streaming `fetch` and then checks
  `feed.emitter.listenerCount('event')` returns to what it was.
