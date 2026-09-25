A checkout request touches the gateway, the orders service and the payments
service, and it is slow. Each service logs and traces on its own, so you have
three unrelated stories. Distributed tracing ties them together by passing
one **trace id** along with every call. The standard header is W3C
**`traceparent`**:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             ^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ^^^^^^^^^^^^^^^^ ^^
        version trace-id (32 hex)               parent-id (16)   flags (01 = sampled)
```

Each service **continues** the incoming trace (same trace id), creates its
own span id, and sends `traceparent` with **its** span id on every outgoing
call — so the next service knows who its parent is. The sampling decision in
the flags travels with it, so a trace is either recorded everywhere or
nowhere.

The mistakes are all at the edges: trusting a malformed header (an
all-zero id, uppercase hex, the invalid version `ff`) and propagating garbage;
starting a new trace when a valid one arrived; and — in Node — keeping "the
current trace" in a module variable, so two concurrent requests overwrite
each other's ids. The current trace belongs in `AsyncLocalStorage`.

## Task

Export three functions.

**`parseTraceparent(header)`** → `{ version, traceId, parentId, flags }`
(`flags` as a number) or `null`. Valid means:

- four `-`-separated fields: version (2 hex), trace-id (32 hex), parent-id
  (16 hex), flags (2 hex) — **lowercase** hex only, no surrounding spaces;
- version is not `ff`; trace-id is not all zeros; parent-id is not all zeros;
- for version `00`, nothing may follow the flags. A **higher** version may
  have more `-`-prefixed fields after the flags (ignore them).

**`formatTraceparent({ traceId, spanId, sampled })`** →
`` `00-${traceId}-${spanId}-${sampled ? '01' : '00'}` ``.

**`createTracing({ ids, sample = () => true } = {})`** →
`{ middleware, current, outgoingHeaders }`. `ids` is
`{ traceId(), spanId() }` returning 32 and 16 lowercase hex characters
(default: random via `node:crypto`). Use it for every id you create.

- **`middleware(handler)`** returns a Node `(req, res)` handler that builds a
  context and runs `handler(req, res)` **inside** it (and returns its result):
  - valid incoming `traceparent` → `{ traceId: <incoming>, parentSpanId:
    <incoming parent-id>, spanId: ids.spanId(), sampled: (flags & 1) === 1 }`,
    and keep the incoming `tracestate` header, if any, to forward it;
  - missing or invalid → `{ traceId: ids.traceId(), parentSpanId: null,
    spanId: ids.spanId(), sampled: sample() }`, and drop any `tracestate`.
    Call `sample()` **only** when starting a new trace.
  - set the response header `x-trace-id` to the trace id before calling the
    handler (support can then find the trace from a customer's report).
- **`current()`** → a copy of `{ traceId, spanId, parentSpanId, sampled }` for
  the request being handled, across any `await`s, or `null` outside one.
- **`outgoingHeaders()`** → for a call made while handling a request:
  `{ traceparent: formatTraceparent({ traceId, spanId, sampled }) }` — **this**
  service's span id as the parent — plus `tracestate` when one was kept.
  Outside a request, `{}`.
