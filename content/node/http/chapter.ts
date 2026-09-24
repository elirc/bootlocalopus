import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'node-http',
  title: 'HTTP from Scratch',
  summary: 'What Express is doing for you: routing, bodies, status codes, middleware.',
  lessons: [
    {
      id: 'node-http-router',
      title: 'A router with no framework',
      kind: 'node',
      xp: 70,
      why: 'Understanding what `app.get()` actually does makes every framework easy and every framework bug debuggable.',
      tags: ['http', 'routing', 'node core'],
      hints: [
        'Strip the query string before matching: `const { pathname } = new URL(req.url, "http://localhost");`',
        'Write one `send(res, status, body)` helper that sets the header and calls `res.end(JSON.stringify(body))`. Every branch then fits on one line.',
        'For the param route, match with a regex — `const match = pathname.match(/^\\/users\\/([^/]+)$/)` — and read `match[1]`.',
        'Order matters: check `/users/:id` before your catch-all, and check the method before deciding it is a 404. A wrong method on a route that exists is a 405, not a 404.',
      ],
    },
    {
      id: 'node-request-body',
      title: 'Reading a request body safely',
      kind: 'node',
      xp: 80,
      why: 'An unbounded body read is a denial-of-service vector. Frameworks default to a limit for a reason.',
      tags: ['http', 'streams', 'security'],
      hints: [
        'Check the header first: read `req.headers` at the "content-length" key. If it already exceeds the limit, reject before touching the stream — that is how you can still send a 413 response, since consuming or destroying the request can take the connection with it.',
        '`for await (const chunk of req)` is the readable way to consume the stream. Track `size += chunk.length`, and `break` the moment it exceeds the limit — breaking closes the stream, so an endless producer stops.',
        'Give your errors a status: `const err = new Error("payload too large"); err.status = 413; throw err;`',
        'Check the parsed type after parsing: `typeof value !== "object" || value === null || Array.isArray(value)` is the "not an object" test.',
        'In the handler, `try { const body = await readJson(req) } catch (err) { send(res, err.status ?? 500, { error: err.message }) }`.',
        'Set a flag when you break, then throw after the loop — throwing from inside a `for await` skips the stream cleanup that `break` performs.',
      ],
    },
    {
      id: 'node-http-semantics',
      title: 'HTTP semantics',
      kind: 'quiz',
      xp: 60,
      why: 'Half of API review comments are about status codes and idempotency. Know them once, stop guessing.',
      tags: ['http', 'api design', 'rest'],
      quiz: [
        {
          q: 'A client POSTs a new order and the network drops before the response arrives. It retries. What prevents a double order?',
          options: [
            'POST is idempotent, so the server handles it automatically',
            'An idempotency key sent by the client that the server records and de-duplicates against',
            'Returning 201 instead of 200',
            'Wrapping the handler in a database transaction',
          ],
          answer: [1],
          explain: 'POST is not idempotent — that is the whole problem. The client supplies a unique key (a UUID it generates), the server stores the result against that key, and a retry with the same key returns the original result instead of creating a second order. A transaction makes one request atomic; it does nothing about two requests.',
        },
        {
          q: 'Which methods are expected to be idempotent (the same request twice has the same effect as once)? Select all.',
          options: ['GET', 'PUT', 'DELETE', 'POST'],
          answer: [0, 1, 2],
          explain: 'GET, PUT and DELETE are idempotent by specification: PUT sets a resource to a state, DELETE removes it (a second DELETE typically 404s or 204s but changes nothing further). POST is not — each one is a new action. PATCH is also not guaranteed idempotent, since a patch can be relative ("increment by 1").',
        },
        {
          q: 'Your API\'s documented convention: `400` when the body is not parseable JSON, `422` when it parses but fails validation. A signup arrives as valid JSON with `"email": "not-an-email"`. Which status?',
          options: [
            '400 Bad Request',
            '422 Unprocessable Content',
            '409 Conflict',
            '500 Internal Server Error',
          ],
          answer: [1],
          explain: 'The body parsed, so by this API\'s own convention it is a 422, with a machine-readable body listing the offending field. (400 for everything is also a common, defensible convention — the real failure is mixing them, so clients cannot rely on the status.) 409 is for conflicts with existing state, such as a duplicate email; 500 says the server broke, which it did not.',
        },
        {
          q: 'Creating a resource that already exists (a duplicate email on signup). Which status is most appropriate?',
          options: ['409 Conflict', '400 Bad Request', '403 Forbidden', '500 Internal Server Error'],
          answer: [0],
          explain: '409 says "the request conflicts with the current state of the resource" — exactly a uniqueness violation. Returning 500 for a caught unique-constraint error is a common bug: it tells the client to retry something that will never succeed, and pages you at 3am.',
        },
        {
          q: 'What is the difference between 401 and 403?',
          options: [
            '401 means "who are you?" (missing or invalid credentials); 403 means "I know who you are and you may not do this"',
            'They are interchangeable',
            '401 is for expired tokens; 403 is for missing ones',
            '403 means the resource does not exist',
          ],
          answer: [0],
          explain: '401 Unauthorized is really unauthenticated — the client should present credentials, and the response should carry a `WWW-Authenticate` header. 403 Forbidden means authentication succeeded but authorisation failed; retrying with the same credentials is pointless.',
        },
        {
          q: 'Your API returns 200 with `{"error": "not found"}`. Why is this a problem? Select all that apply.',
          options: [
            'Clients, proxies and caches treat 200 as success and may cache the error',
            'Generic HTTP error handling in client libraries will not trigger',
            'Monitoring and dashboards will show a 100% success rate while users see failures',
            'It is invalid HTTP and some servers will reject it',
          ],
          answer: [0, 1, 2],
          explain: 'It is legal HTTP, just a lie. The status line is the part every intermediary and every client library reads. Encoding failure only in the body means caches store it, retry logic never fires, and your error rate graph stays flat through an outage.',
        },
        {
          q: 'A long-running job is kicked off by a POST. What should it return?',
          options: [
            '200 with the finished result, after waiting',
            '202 Accepted with a location or id the client can poll for status',
            '204 No Content',
            '201 Created with the job result inline',
          ],
          answer: [1],
          explain: '202 Accepted means "I have taken this on, it is not done yet". Give the client a handle — a job id or a status URL. Holding the connection open for minutes burns a socket, hits every proxy timeout in between, and gives the client nothing to reconnect to.',
        },
      ],
    },
    {
      id: 'node-middleware',
      title: 'The middleware chain',
      kind: 'node',
      xp: 90,
      why: 'Express, Koa and every HTTP framework you will touch is this pattern. Writing it demystifies all of them.',
      tags: ['middleware', 'composition', 'error handling'],
      hints: [
        'Model the walk with an index: `let i = 0; const next = (err) => { ... }`. Each `next()` picks up `middleware[i++]`.',
        'Guard against a double `next()` with a flag per middleware invocation, or by capturing the expected index and ignoring calls that do not match.',
        'Wrap each call in try/catch and `await` it, so both `throw` and a rejected promise route to the error chain: `try { await fn(req, res, next) } catch (e) { next(e) }`.',
        'Run the error chain the same way with its own index, then fall back to the 500 response if no handler responded.',
        'Check `res.writableEnded` (or `res.headersSent`) before writing a fallback response, so you never write twice.',
      ],
    },
  ],
});
