`process.exit()` on SIGTERM kills in-flight requests. A graceful shutdown
happens in two phases, and the order matters:

1. **Start refusing.** Mark yourself unhealthy and answer new requests with
   `503`, while the listener stays open. The load balancer notices and stops
   routing to you.
2. **Close and drain.** Stop accepting connections, let in-flight requests
   finish, then exit — with a hard timeout, so one stuck request cannot block
   the deploy forever.

Skipping phase 1 and calling `server.close()` straight away is the common
mistake: the socket stops accepting, so anything the balancer sends in the next
few milliseconds gets a connection error instead of a clean `503`.

A refinement you will meet in production: behind Kubernetes or a cloud load
balancer, phase 1 is usually "fail the **readiness** check" (`/ready` → 503)
while ordinary requests are still served for the few seconds the balancer
takes to notice. Answering *all* traffic with 503 is simpler, and is what this
lesson grades, but it does show errors to users during that window.

## Task

Export `createGracefulServer({ requestHandler, drainTimeoutMs = 5000 })`
returning `{ server, beginShutdown, shutdown, isShuttingDown, activeRequests }`.

- `server` is a real `http.Server` running `requestHandler`
- `activeRequests` counts requests currently being handled
- `beginShutdown()` flips `isShuttingDown`; from then on **new** requests get
  `503` with a `connection: close` header and body
  `{"error":"server is shutting down"}`. Calling it twice changes nothing.
  The listener stays open.
- `shutdown()` runs `beginShutdown()`, closes the listener, waits for in-flight
  requests, and resolves `{ ok: true, forced: false }`
- if requests are still running after `drainTimeoutMs`, resolve
  `{ ok: true, forced: true }` rather than hanging
- calling `shutdown()` twice returns the same promise, not a second teardown