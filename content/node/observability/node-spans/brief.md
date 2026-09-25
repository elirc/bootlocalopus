A request takes 2.4 seconds and the logs say only "done". A **trace** answers
where the time went: it is a tree of **spans** — "handle POST /checkout"
containing "load cart" (40 ms), "price cart" (60 ms) and "charge card"
(2.2 s) — each with a start, an end, a status, attributes and events.

The core of every tracing library is small: start a span, make it the
**active** span while some code runs so that spans started inside become its
children, end it when the code finishes, record failures, and hand the
finished span to an exporter. The hard part in Node is "active": with
`await` and `Promise.all`, a module-level "current span" variable is wrong
the moment two things run concurrently — `price cart` ends up as a child of
`load cart` because that is what the variable held when it started. The
active span must live in `AsyncLocalStorage`.

## Task

Export `createTracer({ exporter, now = () => performance.now(), ids })`,
returning `{ startActiveSpan, activeSpan }`. `now()` returns milliseconds;
`ids` is `{ traceId(), spanId() }` (default: random hex from `node:crypto`,
32 and 16 characters).

**`startActiveSpan(name, fn, { attributes = {} } = {})`** always returns a
promise.

- Start a span at `now()`. If a span is active, the new span is its child
  (same `traceId`, `parentSpanId` = the parent's `spanId`); otherwise it is a
  root span with a new `traceId` and `parentSpanId: null`. It gets a new
  `spanId`.
- Call `fn(span)` with the new span **active**, where `span` is
  `{ traceId, spanId, setAttribute(key, value), addEvent(name, attributes = {}) }`.
  `fn` may be sync or async.
- When `fn` returns or its promise resolves: end the span with status `'ok'`
  and resolve with `fn`'s result.
- When `fn` throws or rejects: add the event `{ name: 'exception',
  attributes: { 'exception.type': error.name, 'exception.message':
  error.message } }`, end the span with status `'error'`, and reject with the
  **original** error.
- Ending (exactly once) calls `exporter.export(record)` with:

  ```js
  { name, traceId, spanId, parentSpanId, startTime, endTime,
    durationMs,                 // endTime - startTime
    status,                     // 'ok' | 'error'
    attributes,                 // the initial attributes plus setAttribute calls
    events }                    // [{ name, time, attributes }] in order, time from now()
  ```

  If `exporter.export` throws, ignore it: telemetry must never break the
  request.
- After a span has ended, `setAttribute` and `addEvent` on it do nothing.

**`activeSpan()`** → `{ traceId, spanId }` of the active span, or `null`.
