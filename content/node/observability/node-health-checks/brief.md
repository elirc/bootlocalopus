The database has a 30-second blip. Kubernetes' **liveness** probe hits
`/health`, which pings the database, fails three times, and Kubernetes
**restarts every pod** — which then all reconnect at once, and the blip
becomes a 10-minute outage. Meanwhile the load balancer kept sending traffic
to a pod that was mid-shutdown, because its health endpoint still said "ok".

Two probes, two questions:

- **Liveness** (`/livez`): *is this process wedged and worth killing?* It
  must **not** check dependencies — restarting your pod does not fix the
  database.
- **Readiness** (`/readyz`): *should this pod receive traffic right now?* It
  checks the dependencies it cannot serve without, each with a **timeout** (a
  hung check must not hang the probe), and turns **not ready** while the pod
  drains for shutdown.

Probes arrive every few seconds from several places at once. Checks run in
**parallel**, concurrent probes **share** one evaluation, and a recent result
is **cached** so the probes do not become a load test on the database.

## Task

Export `createHealth({ checks, timeoutMs = 1000, cacheMs = 1000, now = Date.now, timers = { setTimeout, clearTimeout } })`,
returning `{ handler, setDraining }`.

`checks` is an array of `{ name, critical = true, check }`, where
`check(signal)` returns a promise (or throws) and receives an `AbortSignal`.

**`handler(req, res)`** serves (other paths → `404`):

- **`GET /livez`** → `200` `{ "status": "ok" }`. Runs no checks.
- **`GET /readyz`** → the readiness result below.

Every response is JSON (`content-type: application/json`) with
`cache-control: no-store`.

**Readiness.** If `setDraining(true)` was called, answer `503`
`{ "status": "draining" }` without running anything. Otherwise evaluate:

- Start **every** check at once. Each gets its own `AbortSignal`, and a
  `timers.setTimeout(…, timeoutMs)`; a check still pending when its timer
  fires **fails** with error `'timeout'`, and its signal is aborted. Clear
  the timer when a check settles first. A check that throws synchronously
  fails like one that rejects.
- The result is `{ status, checks }`, where `checks[name]` is
  `{ "status": "ok" }` or `{ "status": "fail", "error": <message> }`
  (`'timeout'` for a timeout, otherwise the error's `message`).
- `status` is `'fail'` (HTTP **503**) if any **critical** check failed,
  otherwise `'degraded'` (**200**) if a non-critical one failed, otherwise
  `'ok'` (**200**).

**Sharing and caching.** While an evaluation is running, another `/readyz`
waits for the same one instead of starting its own. A finished evaluation is
reused for requests arriving while `now() - finishedAt < cacheMs`; after that
the next request runs a fresh one. Draining is checked on every request, even
when a cached result exists.
