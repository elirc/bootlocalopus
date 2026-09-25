Lab tools (Lighthouse on your laptop) tell you what performance **could**
be; field data from real users tells you what it **is**. Collecting it is
the job of a small reporter, and the naive one loses most of its data:

- It sends on `unload` or `beforeunload`, which mobile browsers often never
  fire (the tab is backgrounded, then killed). The reliable signal is
  `visibilitychange` to `hidden`, with `pagehide` as a backup.
- It uses a normal `fetch`, which is cancelled when the page goes away.
  `navigator.sendBeacon` hands the request to the browser; if it refuses
  (it returns `false` when the payload is too big or its queue is full), fall
  back to `fetch(…, { keepalive: true })`.
- It sends every update. CLS and INP are reported **repeatedly** with the
  same `id` as they grow; only the latest value per `id` matters.
- It sends from every page view of every user, and the analytics bill
  follows. Sample — per page view, decided once.

## Task

Export `createVitalsReporter({ endpoint, sessionId, sampleRate = 1, random = Math.random, transport })`.
`transport` is `{ beacon(url, body), fetch(url, init) }` (the grader's
fakes of `navigator.sendBeacon` and `fetch`). It returns
`{ record(metric), flush(), attach(target) }`.

- **Sampling**: call `random()` **once**, when the reporter is created. The
  page view is sampled when `random() < sampleRate`. If it is not, `record`
  and `flush` do nothing at all.
- **`record({ name, value, id, rating })`** keeps the latest metric for each
  `id`. The value is rounded: `CLS` to 4 decimal places
  (`Math.round(v * 10000) / 10000`), every other metric with `Math.round`.
- **`flush()`** sends the metrics recorded or changed since the last flush,
  in the order their `id` was first recorded. A metric recorded again with
  the same rounded value and rating does not count as changed. Nothing
  pending → send nothing. The body is
  `JSON.stringify({ sessionId, metrics: [{ name, value, id, rating }, …] })`.
  Call `transport.beacon(endpoint, body)`; if it returns `false`, call
  `transport.fetch(endpoint, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } })`.
  Either way, the metrics are no longer pending.
- **`attach(target)`**: `target` is an `EventTarget` with a
  `visibilityState` property (the `document`, in the browser). Listen for
  `visibilitychange` on it — flush when `target.visibilityState` is
  `'hidden'` — and for `pagehide`, which always flushes. Return a function
  that removes both listeners.
