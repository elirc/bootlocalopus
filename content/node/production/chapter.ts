import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'node-production',
  title: 'Production Node',
  summary: 'The code between a working service and one that survives traffic: caches that do not stampede, logs you can query, live updates, and breakers around flaky dependencies.',
  lessons: [
    {
      id: 'node-cache-singleflight',
      title: 'An in-process cache that does not stampede',
      kind: 'node',
      xp: 100,
      why: 'A naive cache fails exactly when you need it: at expiry under load. Single-flight, bounded size and safe invalidation are what make one production-grade.',
      tags: ['caching', 'concurrency', 'promises', 'performance'],
      hints: [
        'Keep two maps: `entries` (key → `{ value, storedAt }`) and `inflight` (key → the promise of the pending load). A miss first checks `inflight` and returns that promise if there is one.',
        'Start the load with `new Promise((resolve) => resolve(loader(key)))` — a synchronous throw inside the executor becomes a rejection instead of escaping `getOrLoad`.',
        'Attach `.then(onValue, onError)` to the load and store *that* chained promise in `inflight`. In both handlers remove the `inflight` entry; only `onValue` stores. `onError` must rethrow, or waiters get `undefined` instead of the error.',
        'For LRU, a `Map` iterates in insertion order: on every use, `delete(key)` then `set(key, entry)` to move it to the end, and evict `entries.keys().next().value` while `entries.size > max`.',
        'For delete-during-load: in the handlers, only write if `inflight.get(key) === thisLoad`. `delete(key)` removes the `inflight` entry, so an orphaned load sees it is no longer current and just returns its value.',
      ],
    },
    {
      id: 'node-structured-logging',
      title: 'Structured logs with request context',
      kind: 'node',
      xp: 100,
      why: 'During an incident, logs are the only witness. JSON lines with a request id on every one are the difference between a five-minute and a five-hour diagnosis.',
      tags: ['observability', 'logging', 'async_hooks', 'security'],
      hints: [
        'Make one module-level `const context = new AsyncLocalStorage()`. `withContext(fields, fn)` is `context.run({ ...context.getStore(), ...fields }, fn)` — spreading `undefined` is fine.',
        'Build a line as `{ ...context.getStore(), ...bindings, ...fields }`, delete `level`, `time` and `msg` from that, clean it, then put `level`, `time`, `msg` first. `child` is just `make({ ...bindings, ...more })` over the same options.',
        'Write one recursive `clean(value, ancestors)`: primitives pass through; an `Error` becomes `{ name, message, stack }`; arrays map; plain objects copy key by key, putting `\'[REDACTED]\'` where `redact.has(key.toLowerCase())`. Copying is also what keeps the caller\'s object unmutated.',
        'For cycles, track the objects on the **current path** in a `Set`: add before recursing, delete in a `finally` after. A global "seen" set would wrongly mark an object referenced twice as circular.',
        'In `requestLogging`, `res.on(\'finish\')` callbacks are not guaranteed to run inside your context — they are emitted by socket internals. Wrap the completion log in `withContext({ requestId }, ...)` again, and run the handler as `await withContext({ requestId }, async () => { try { await handler(req, res) } catch (err) { ... } })`.',
      ],
    },
    {
      id: 'node-sse',
      title: 'Live updates with Server-Sent Events',
      kind: 'node',
      xp: 105,
      why: 'Notifications, progress bars and dashboards all want push. SSE is the simplest correct way to do it over HTTP, and its classic bug — a listener per dead connection — is a textbook memory leak.',
      tags: ['http', 'streaming', 'events', 'memory leaks'],
      hints: [
        '`res.writeHead(200, { \'content-type\': \'text/event-stream\', \'cache-control\': \'no-cache\' })` then `res.flushHeaders()`. Never call `res.end()`: the response stays open until the client leaves.',
        'Write a tiny `format(event)` that returns `` `id: ${event.id}\\nevent: ${event.type}\\ndata: ${JSON.stringify(event.data)}\\n\\n` ``. `JSON.stringify` never emits a raw newline, which is what keeps `data:` to one line.',
        'Validate the header with `/^\\d+$/.test(req.headers[\'last-event-id\'])`; `Number(\'\')` is 0 and `Number(\'1.5\')` is 1.5, neither of which you want to replay from.',
        'Replay `feed.since(id)` and then `feed.emitter.on(\'event\', onEvent)` in the same synchronous block — no `await` between them — so no event can slip through the gap or arrive twice.',
        'Keep references to the exact listener function and the interval handle, and in `req.on(\'close\', ...)` call `feed.emitter.off(\'event\', onEvent)` and `timers.clearInterval(handle)`. An anonymous arrow passed to `on` can never be removed.',
      ],
    },
    {
      id: 'node-circuit-breaker',
      title: 'BOSS: timeouts, fallbacks and a circuit breaker',
      kind: 'node',
      xp: 230,
      boss: true,
      why: 'One slow dependency taking down a whole service is the most common shape of a real outage. This is the code that contains it, and the design conversation every senior interview gets to.',
      tags: ['resilience', 'state machines', 'timeouts', 'promises', 'operations'],
      hints: [
        'Start with `attempt(args)`: a `new Promise` that starts `timers.setTimeout(() => reject(new TimeoutError(ms)), ms)`, runs `Promise.resolve(fn(...args))` inside a try/catch (for a synchronous throw), and settles through one guard — `if (settled) return; settled = true; timers.clearTimeout(timer)`. Always attaching `.then(onOk, onErr)` is what stops a late rejection going unhandled.',
        'Make `call` an `async` function: then it can never throw synchronously, and a `return failWith(error, args)` where `failWith` either throws or returns `fallback(error, ...args)` covers every fallback path.',
        'The open → half-open move happens inside `call`: `if (state === \'open\') { if (now() - openedAt < resetTimeoutMs) return failWith(new CircuitOpenError(), args); toHalfOpen(); }`. Then a single `probing` boolean enforces one probe: set it when you admit the probe, and reject everyone else while it is true.',
        'Stale results: keep a `generation` counter that every transition bumps. Record `const admittedIn = generation` before awaiting the attempt, and only update `failures`/state afterwards if `generation === admittedIn`. The caller still gets the result either way.',
        'Classify an error once: `const counted = error instanceof TimeoutError || isFailure(error)`. Counted → record a failure (in half-open that means reopen with `openedAt = now()`), then fall back. Not counted → record a success, and `throw error` without the fallback.',
        'Route every change through one `transition(to)` that stores the state, resets `probing`, bumps `generation` and calls `onStateChange(from, to)`. Five places changing `state` by hand is where the half-open bugs come from.',
      ],
    },
  ],
});
