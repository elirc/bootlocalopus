import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'node-runtime',
  title: 'Runtime Craft',
  summary: 'Streams, clean shutdowns, and the layering that makes a service testable.',
  lessons: [
    {
      id: 'node-streams',
      title: 'A Transform stream for NDJSON',
      kind: 'node',
      xp: 95,
      why: 'Reading a 2 GB export into a string is a production incident. Streams are how you process data larger than memory.',
      tags: ['streams', 'backpressure', 'parsing'],
      hints: [
        'Keep a `buffer` string in the closure. Each transform: `buffer += decoder.write(chunk); const lines = buffer.split("\\n"); buffer = lines.pop();` — `pop` leaves the (possibly incomplete) tail behind.',
        '`const decoder = new StringDecoder("utf8")` from `node:string_decoder`. `decoder.write(chunk)` returns only complete characters and keeps a split one for next time; call `decoder.end()` in `flush`.',
        '`this.push(parsed)` emits a record downstream. Call `callback()` once at the end of transform, or `callback(error)` to fail the stream.',
        'In `flush`, process whatever is left in the buffer before calling back — that is the line with no trailing newline.',
        'For `sumField`, `await pipeline(source, createNdjsonParser(), async (records) => { for await (const r of records) total += r[field] ?? 0; })` with `pipeline` from `node:stream/promises` — unlike `.pipe()`, it rejects if the source fails.',
        'Remember `\\r`: a file written on Windows has `\\r\\n` line endings, so trim each line before parsing.',
      ],
    },
    {
      id: 'node-graceful-shutdown',
      title: 'Shutting down without dropping requests',
      kind: 'node',
      xp: 90,
      why: 'Every deploy sends SIGTERM. Without this, every deploy 502s whoever was mid-request.',
      tags: ['lifecycle', 'operations', 'http'],
      hints: [
        'Track completion with `res.on(\'close\', ...)` — it fires whether the response finished or the client hung up, which `res.on(\'finish\')` does not.',
        'Increment before calling the handler and decrement in the close listener, so even a synchronous handler is counted.',
        'Memoise: `shutdown() { if (shutdownPromise) return shutdownPromise; shutdownPromise = (async () => { ... })(); return shutdownPromise; }`.',
        '`server.close(cb)` stops accepting new connections and calls back once existing ones end. Race it against a timer with `Promise.race`.',
        'To wait for the drain, poll: a `setInterval` every 10 ms that resolves once `active === 0` is perfectly adequate and easy to reason about.',
        'Idle keep-alive sockets used to keep `server.close()` waiting even with no active requests. Since Node 19, `server.close()` closes idle connections itself; `server.closeIdleConnections?.()` is only needed on older versions (harmless here).',
      ],
    },
    {
      id: 'node-layering',
      title: 'Handlers, services, repositories',
      kind: 'node',
      xp: 95,
      why: 'The structural difference between a codebase you can test and one where every test needs a database.',
      tags: ['architecture', 'dependency injection', 'testability'],
      hints: [
        'Keep the repository dumb: `insert(data)` assigns the next id and stores; it must not validate anything. That is the service\'s job.',
        'Validate the email with something simple and honest: a non-empty string containing `@` with characters either side. Do not attempt a full RFC regex.',
        'Normalise before checking for duplicates, or `Ada@X.com` and `ada@x.com` both register.',
        'Idempotent `deactivate` means: if already inactive, return it unchanged rather than throwing.',
        'The handler should hold no rules — just parse, call, and translate errors to statuses with a small map from error name to status code.',
      ],
    },
    {
      id: 'node-crud-boss',
      title: 'BOSS: a service you could deploy',
      kind: 'node',
      xp: 260,
      boss: true,
      why: 'Everything from this track in one API: routing, bodies, validation, auth, errors, pagination. This is the take-home.',
      tags: ['api design', 'auth', 'validation', 'pagination'],
      hints: [
        'Start with the plumbing: `send(res, status, body)`, `fail(res, status, code, message, details)`, and `readJson(req)`. Everything else gets shorter.',
        'Write one validator that takes the input and a `partial` flag. For create, a missing title is an error; for patch, a missing title just means "do not change it".',
        'Collect errors into `details` and only throw/respond once, so a client fixing three fields needs one round trip, not three.',
        'Check auth before routing (except `/health`) — one early return keeps it out of every handler.',
        'For 204, call `res.writeHead(204)` and `res.end()` with no body at all. A JSON body with 204 is a protocol violation that some clients choke on.',
        'Sort newest first by comparing `createdAt` descending; with sequential ids, `Number(b.id) - Number(a.id)` is equivalent and cheaper.',
        'Set `updatedAt` to `now()` on create as well as patch — clients rely on it existing.',
      ],
    },
  ],
});
