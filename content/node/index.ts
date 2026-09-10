import { track } from '../types.ts';

export const nodeTrack = track({
  id: 'node',
  title: 'Node & API Engineering',
  icon: '⬢',
  color: '#68a063',
  weight: 1.1,
  blurb: 'Build the server without the framework first, then add the layers a real service needs: validation, error envelopes, auth, rate limits, streams and a clean shutdown. Graded against real HTTP requests.',
  chapters: [
    /* ================================================================== */
    {
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
          brief: `\`node:http\` gives you a request and a response. Everything else —
routing, params, JSON, status codes — is code someone wrote. Write it once.

## Task

Export \`createServer()\` returning a \`http.Server\` that handles:

| request | response |
| --- | --- |
| \`GET /health\` | \`200\` \`{"status":"ok"}\` |
| \`GET /users\` | \`200\` a JSON array of the two seeded users |
| \`GET /users/:id\` | \`200\` that user, or \`404\` \`{"error":"not found"}\` |
| \`POST /users\` | \`405\` with an \`Allow: GET\` header |
| anything else | \`404\` \`{"error":"not found"}\` |

Seed data: \`[{ id: '1', name: 'ada' }, { id: '2', name: 'bob' }]\`.

Every response must set \`content-type: application/json\`. Query strings must
not break routing — \`/health?verbose=1\` still works.`,
          starter: `import http from 'node:http';

const USERS = [
  { id: '1', name: 'ada' },
  { id: '2', name: 'bob' },
];

export function createServer() {
  return http.createServer((req, res) => {
    // TODO: parse the path, route, respond with JSON
  });
}
`,
          hints: [
            'Strip the query string before matching: `const { pathname } = new URL(req.url, "http://localhost");`',
            'Write one `send(res, status, body)` helper that sets the header and calls `res.end(JSON.stringify(body))`. Every branch then fits on one line.',
            'For the param route, match with a regex — `const match = pathname.match(/^\\/users\\/([^/]+)$/)` — and read `match[1]`.',
            'Order matters: check `/users/:id` before your catch-all, and check the method before deciding it is a 404. A wrong method on a route that exists is a 405, not a 404.',
          ],
          solution: `import http from 'node:http';

const USERS = [
  { id: '1', name: 'ada' },
  { id: '2', name: 'bob' },
];

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export function createServer() {
  return http.createServer((req, res) => {
    // A relative URL needs a base; the host is irrelevant for parsing.
    const { pathname } = new URL(req.url, 'http://localhost');

    if (pathname === '/health') {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET', 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'method not allowed' }));
      }
      return send(res, 200, { status: 'ok' });
    }

    if (pathname === '/users') {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET', 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'method not allowed' }));
      }
      return send(res, 200, USERS);
    }

    const match = pathname.match(/^\\/users\\/([^/]+)$/);
    if (match) {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET', 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'method not allowed' }));
      }
      const user = USERS.find((u) => u.id === match[1]);
      return user ? send(res, 200, user) : send(res, 404, { error: 'not found' });
    }

    return send(res, 404, { error: 'not found' });
  });
}
`,
          tests: `const start = async () => {
  const server = solution.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    server,
    url: (path) => 'http://127.0.0.1:' + port + path,
    close: () => new Promise((r) => server.close(r)),
  };
};

describe('routing', () => {
  it('serves GET /health', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/health'));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.json()).toEqual({ status: 'ok' });
    } finally { await app.close(); }
  });

  it('ignores the query string', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/health?verbose=1&x=2'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    } finally { await app.close(); }
  });

  it('lists users', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/users'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([{ id: '1', name: 'ada' }, { id: '2', name: 'bob' }]);
    } finally { await app.close(); }
  });

  it('serves one user by id', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/users/2'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: '2', name: 'bob' });
    } finally { await app.close(); }
  });

  it('404s an unknown user', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/users/999'));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not found' });
    } finally { await app.close(); }
  });

  it('404s an unknown path with JSON, not HTML', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/nope'));
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.json()).toEqual({ error: 'not found' });
    } finally { await app.close(); }
  });

  it('does not treat a nested path as a user id', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/users/1/posts'));
      expect(res.status).toBe(404);
    } finally { await app.close(); }
  });

  it('405s a wrong method on a route that exists, and says what is allowed', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/users'), { method: 'POST' });
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('GET');
    } finally { await app.close(); }
  });

  it('405s a wrong method on /health too', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/health'), { method: 'DELETE' });
      expect(res.status).toBe(405);
    } finally { await app.close(); }
  });
});`,
        },
        {
          id: 'node-request-body',
          title: 'Reading a request body safely',
          kind: 'node',
          xp: 80,
          why: 'An unbounded body read is a denial-of-service vector. Frameworks default to a limit for a reason.',
          tags: ['http', 'streams', 'security'],
          brief: `A request body is a stream. Concatenating it without a limit means one
client can exhaust your memory. Parsing it without a try/catch means one
malformed payload takes down the handler.

## Task

Export \`readJson(req, { limit = 1024 } = {})\`, an async function that:

- rejects immediately with \`status: 413\` if a \`content-length\` header already
  declares more than \`limit\` bytes — without reading the body at all
- otherwise collects the body, and still rejects with \`413\` if the actual bytes
  exceed \`limit\`, stopping as soon as it knows rather than buffering the rest
- rejects with \`status\` \`400\` for invalid JSON
- rejects with \`status\` \`400\` if the parsed value is not an object
- returns \`{}\` for a completely empty body

Then export \`createServer()\`: \`POST /echo\` responds \`200\` with
\`{ received: <body> }\`, or the error's status and \`{ error: <message> }\`.`,
          starter: `import http from 'node:http';

export async function readJson(req, { limit = 1024 } = {}) {
  // TODO
}

export function createServer() {
  return http.createServer(async (req, res) => {
    // TODO: call readJson and translate its errors into responses
  });
}
`,
          hints: [
            'Check the header first: read `req.headers` at the "content-length" key. If it already exceeds the limit, reject before touching the stream — that is how you can still send a 413 response, since consuming or destroying the request can take the connection with it.',
            '`for await (const chunk of req)` is the readable way to consume the stream. Track `size += chunk.length`, and `break` the moment it exceeds the limit — breaking closes the stream, so an endless producer stops.',
            'Give your errors a status: `const err = new Error("payload too large"); err.status = 413; throw err;`',
            'Check the parsed type after parsing: `typeof value !== "object" || value === null || Array.isArray(value)` is the "not an object" test.',
            'In the handler, `try { const body = await readJson(req) } catch (err) { send(res, err.status ?? 500, { error: err.message }) }`.',
            'Set a flag when you break, then throw after the loop — throwing from inside a `for await` skips the stream cleanup that `break` performs.',
          ],
          solution: `import http from 'node:http';

const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export async function readJson(req, { limit = 1024 } = {}) {
  // Cheapest possible rejection: the client told us how big it is. Doing this
  // before touching the stream is also what lets us still send a response.
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    throw httpError(413, 'payload too large');
  }

  const chunks = [];
  let size = 0;
  let tooLarge = false;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      // break (not throw) so the stream is closed properly and an endless
      // producer stops sending.
      tooLarge = true;
      break;
    }
    chunks.push(chunk);
  }
  if (tooLarge) throw httpError(413, 'payload too large');

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw httpError(400, 'invalid json');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw httpError(400, 'body must be an object');
  }
  return parsed;
}

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export function createServer() {
  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (req.method !== 'POST' || pathname !== '/echo') {
      return send(res, 404, { error: 'not found' });
    }
    try {
      const received = await readJson(req);
      send(res, 200, { received });
    } catch (error) {
      send(res, error.status ?? 500, { error: error.message });
    }
  });
}
`,
          tests: `import { Readable } from 'node:stream';

const fakeRequest = (body) => Readable.from([Buffer.from(body)]);

const start = async () => {
  const server = solution.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    post: (path, body, headers) => fetch('http://127.0.0.1:' + port + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    }),
    close: () => new Promise((r) => server.close(r)),
  };
};

describe('readJson', () => {
  it('parses a JSON object', async () => {
    expect(await solution.readJson(fakeRequest('{"name":"ada"}'))).toEqual({ name: 'ada' });
  });

  it('returns {} for an empty body', async () => {
    expect(await solution.readJson(fakeRequest(''))).toEqual({});
  });

  it('handles a body arriving in several chunks', async () => {
    const chunked = Readable.from([Buffer.from('{"a":'), Buffer.from('1'), Buffer.from('}')]);
    expect(await solution.readJson(chunked)).toEqual({ a: 1 });
  });

  it('rejects invalid JSON with status 400', async () => {
    let caught;
    try { await solution.readJson(fakeRequest('{not json')); } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect(caught.status).toBe(400);
    expect(caught.message).toBe('invalid json');
  });

  it('rejects a non-object body with status 400', async () => {
    for (const body of ['"a string"', '42', 'true', '[1,2,3]', 'null']) {
      let caught;
      try { await solution.readJson(fakeRequest(body)); } catch (e) { caught = e; }
      expect(caught?.status).toBe(400);
    }
  });

  it('rejects an oversized body with status 413', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(2000) });
    let caught;
    try { await solution.readJson(fakeRequest(big), { limit: 100 }); } catch (e) { caught = e; }
    expect(caught?.status).toBe(413);
    expect(caught.message).toBe('payload too large');
  });

  it('stops reading instead of buffering the whole oversized body', async () => {
    let produced = 0;
    const endless = new Readable({
      read() {
        produced++;
        this.push(Buffer.alloc(64, 'x'));
      },
    });
    let caught;
    try { await solution.readJson(endless, { limit: 128 }); } catch (e) { caught = e; }
    expect(caught?.status).toBe(413);
    // It must give up almost immediately, not read forever.
    expect(produced).toBeLessThan(20);
  });

  it('accepts a body exactly at the limit', async () => {
    const body = '{"a":1}';
    expect(await solution.readJson(fakeRequest(body), { limit: body.length })).toEqual({ a: 1 });
  });
});

describe('the server', () => {
  it('echoes a valid body', async () => {
    const app = await start();
    try {
      const res = await app.post('/echo', '{"hello":"world"}');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: { hello: 'world' } });
    } finally { await app.close(); }
  });

  it('returns 400 for malformed JSON', async () => {
    const app = await start();
    try {
      const res = await app.post('/echo', '{oops');
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('invalid json');
    } finally { await app.close(); }
  });

  it('returns 413 for a body over the limit', async () => {
    const app = await start();
    try {
      const res = await app.post('/echo', JSON.stringify({ pad: 'x'.repeat(5000) }));
      expect(res.status).toBe(413);
    } finally { await app.close(); }
  });

  it('does not crash the process on a bad body', async () => {
    const app = await start();
    try {
      await app.post('/echo', '{bad');
      const res = await app.post('/echo', '{"still":"alive"}');
      expect(res.status).toBe(200);
    } finally { await app.close(); }
  });

  it('404s other routes', async () => {
    const app = await start();
    try {
      expect((await app.post('/nope', '{}')).status).toBe(404);
    } finally { await app.close(); }
  });
});`,
        },
        {
          id: 'node-http-semantics',
          title: 'HTTP semantics',
          kind: 'quiz',
          xp: 60,
          why: 'Half of API review comments are about status codes and idempotency. Know them once, stop guessing.',
          tags: ['http', 'api design', 'rest'],
          brief: `Status codes and method semantics are a contract with every client, proxy
and CDN between you and the user. Getting them wrong causes retries that
double-charge and caches that serve stale data.`,
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
              q: 'A validation failure on a create endpoint. Which status?',
              options: ['400 Bad Request', '422 Unprocessable Content', '409 Conflict', '400 or 422 — both are defensible, but be consistent'],
              answer: [3],
              explain: '400 for a malformed request, 422 for well-formed syntax that fails semantic validation, is the common split — but plenty of good APIs use 400 for both. What matters is picking one and applying it everywhere, with a machine-readable body listing the offending fields.',
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
          brief: `Express middleware is a chain of \`(req, res, next)\` functions. \`next()\`
passes control on; \`next(err)\` skips to the error handlers. That is the whole
model, and it is about forty lines.

## Task

Export \`createApp()\` returning an app object with:

- \`use(fn)\` — add middleware \`(req, res, next)\`; returns the app for chaining
- \`useError(fn)\` — add an error handler \`(err, req, res, next)\`
- \`handle(req, res)\` — run the chain

Rules:

1. Middleware run in registration order.
2. Middleware that never calls \`next()\` ends the chain (it responded itself).
3. \`next(err)\` — or a **thrown** error, sync or async — jumps to the first
   error handler, skipping remaining normal middleware.
4. If nobody responded by the end, respond \`404\` with \`{"error":"not found"}\`.
5. If an error reaches the end with no handler, respond \`500\` with
   \`{"error":"internal error"}\`.
6. Calling \`next()\` twice from one middleware must not run the rest twice.`,
          starter: `export function createApp() {
  const middleware = [];
  const errorHandlers = [];

  return {
    use(fn) {
      // TODO
    },
    useError(fn) {
      // TODO
    },
    async handle(req, res) {
      // TODO: walk the chain, then the error chain, then the fallbacks
    },
  };
}
`,
          hints: [
            'Model the walk with an index: `let i = 0; const next = (err) => { ... }`. Each `next()` picks up `middleware[i++]`.',
            'Guard against a double `next()` with a flag per middleware invocation, or by capturing the expected index and ignoring calls that do not match.',
            'Wrap each call in try/catch and `await` it, so both `throw` and a rejected promise route to the error chain: `try { await fn(req, res, next) } catch (e) { next(e) }`.',
            'Run the error chain the same way with its own index, then fall back to the 500 response if no handler responded.',
            'Check `res.writableEnded` (or `res.headersSent`) before writing a fallback response, so you never write twice.',
          ],
          solution: `const send = (res, status, body) => {
  if (res.writableEnded || res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export function createApp() {
  const middleware = [];
  const errorHandlers = [];

  const runErrors = async (error, req, res) => {
    let index = 0;
    const nextError = async (err) => {
      const handler = errorHandlers[index++];
      if (!handler) return send(res, 500, { error: 'internal error' });
      try {
        await handler(err, req, res, nextError);
      } catch (thrown) {
        await nextError(thrown);
      }
    };
    await nextError(error);
  };

  return {
    use(fn) {
      middleware.push(fn);
      return this;
    },

    useError(fn) {
      errorHandlers.push(fn);
      return this;
    },

    async handle(req, res) {
      let index = 0;

      const next = async (error) => {
        if (error) return runErrors(error, req, res);

        const fn = middleware[index++];
        if (!fn) return send(res, 404, { error: 'not found' });

        // A middleware that calls next() twice must not replay the chain.
        let called = false;
        const guarded = (err) => {
          if (called) return;
          called = true;
          return next(err);
        };

        try {
          await fn(req, res, guarded);
        } catch (thrown) {
          if (!called) {
            called = true;
            await runErrors(thrown, req, res);
          }
        }
      };

      await next();
    },
  };
}
`,
          tests: `import http from 'node:http';

const start = async (configure) => {
  const app = solution.createApp();
  configure(app);
  const server = http.createServer((req, res) => app.handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    get: (path = '/') => fetch('http://127.0.0.1:' + port + path),
    close: () => new Promise((r) => server.close(r)),
  };
};

const respond = (status, body) => (req, res) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

describe('the chain', () => {
  it('runs middleware in order', async () => {
    const order = [];
    const app = await start((a) => {
      a.use((req, res, next) => { order.push('first'); next(); });
      a.use((req, res, next) => { order.push('second'); next(); });
      a.use(respond(200, { ok: true }));
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(200);
      expect(order).toEqual(['first', 'second']);
    } finally { await app.close(); }
  });

  it('stops when a middleware responds without calling next', async () => {
    const reached = [];
    const app = await start((a) => {
      a.use((req, res) => { reached.push('responder'); respond(201, { made: true })(req, res); });
      a.use(() => { reached.push('should not run'); });
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ made: true });
      expect(reached).toEqual(['responder']);
    } finally { await app.close(); }
  });

  it('lets middleware share state through req', async () => {
    const app = await start((a) => {
      a.use((req, res, next) => { req.user = { id: 7 }; next(); });
      a.use((req, res) => respond(200, { userId: req.user.id })(req, res));
    });
    try {
      expect(await (await app.get()).json()).toEqual({ userId: 7 });
    } finally { await app.close(); }
  });

  it('404s when nobody responds', async () => {
    const app = await start((a) => {
      a.use((req, res, next) => next());
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not found' });
    } finally { await app.close(); }
  });

  it('404s an app with no middleware at all', async () => {
    const app = await start(() => {});
    try {
      expect((await app.get()).status).toBe(404);
    } finally { await app.close(); }
  });

  it('use() is chainable', async () => {
    const app = solution.createApp();
    expect(app.use(() => {})).toBe(app);
    expect(app.useError(() => {})).toBe(app);
  });

  it('ignores a second next() from the same middleware', async () => {
    const runs = [];
    const app = await start((a) => {
      a.use((req, res, next) => { next(); next(); });
      a.use((req, res, next) => { runs.push('downstream'); respond(200, {})(req, res); });
    });
    try {
      await app.get();
      expect(runs).toEqual(['downstream']);
    } finally { await app.close(); }
  });
});

describe('error routing', () => {
  it('next(err) jumps to the error handler', async () => {
    const skipped = [];
    const app = await start((a) => {
      a.use((req, res, next) => next(new Error('boom')));
      a.use(() => { skipped.push('normal middleware'); });
      a.useError((err, req, res) => respond(500, { error: err.message })(req, res));
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'boom' });
      expect(skipped).toEqual([]);
    } finally { await app.close(); }
  });

  it('catches a synchronous throw', async () => {
    const app = await start((a) => {
      a.use(() => { throw new Error('sync boom'); });
      a.useError((err, req, res) => respond(500, { error: err.message })(req, res));
    });
    try {
      expect(await (await app.get()).json()).toEqual({ error: 'sync boom' });
    } finally { await app.close(); }
  });

  it('catches an async rejection', async () => {
    const app = await start((a) => {
      a.use(async () => { throw new Error('async boom'); });
      a.useError((err, req, res) => respond(500, { error: err.message })(req, res));
    });
    try {
      expect(await (await app.get()).json()).toEqual({ error: 'async boom' });
    } finally { await app.close(); }
  });

  it('passes an error along the error chain with next(err)', async () => {
    const seen = [];
    const app = await start((a) => {
      a.use(() => { throw new Error('original'); });
      a.useError((err, req, res, next) => { seen.push('first'); next(err); });
      a.useError((err, req, res) => { seen.push('second'); respond(418, { error: err.message })(req, res); });
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(418);
      expect(seen).toEqual(['first', 'second']);
    } finally { await app.close(); }
  });

  it('lets an error handler recover and respond normally', async () => {
    const app = await start((a) => {
      a.use(() => { throw Object.assign(new Error('not found'), { status: 404 }); });
      a.useError((err, req, res) => respond(err.status ?? 500, { error: err.message })(req, res));
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(404);
    } finally { await app.close(); }
  });

  it('500s when an error has no handler', async () => {
    const app = await start((a) => {
      a.use(() => { throw new Error('nobody is listening'); });
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'internal error' });
    } finally { await app.close(); }
  });

  it('500s when the error handler itself throws', async () => {
    const app = await start((a) => {
      a.use(() => { throw new Error('first'); });
      a.useError(() => { throw new Error('handler broke too'); });
    });
    try {
      expect((await app.get()).status).toBe(500);
    } finally { await app.close(); }
  });

  it('keeps serving after an error', async () => {
    let requests = 0;
    const app = await start((a) => {
      a.use((req, res, next) => {
        requests++;
        if (requests === 1) throw new Error('first request fails');
        next();
      });
      a.use(respond(200, { ok: true }));
      a.useError((err, req, res) => respond(500, { error: err.message })(req, res));
    });
    try {
      expect((await app.get()).status).toBe(500);
      expect((await app.get()).status).toBe(200);
    } finally { await app.close(); }
  });
});`,
        },
      ],
    },

    /* ================================================================== */
    {
      id: 'node-api',
      title: 'API Engineering',
      summary: 'Input validation, error envelopes, signed tokens, and rate limits.',
      lessons: [
        {
          id: 'node-validation',
          title: 'Validating query input',
          kind: 'node',
          xp: 75,
          why: '`?limit=-1` and `?limit=abc` are how a list endpoint becomes an outage.',
          tags: ['validation', 'api design', 'defensive coding'],
          brief: `Query parameters are strings from strangers. \`parseInt(req.query.limit)\`
gives you \`NaN\` for \`"abc"\`, and \`NaN\` flows silently into your SQL.

## Task

Export \`parsePagination(searchParams)\` taking a \`URLSearchParams\` and
returning \`{ limit, offset, sort, direction }\`:

| param | rules |
| --- | --- |
| \`limit\` | integer, default \`20\`, min \`1\`, max \`100\` |
| \`offset\` | integer, default \`0\`, min \`0\` |
| \`sort\` | one of \`createdAt\`, \`name\`, \`score\`; default \`createdAt\` |
| \`direction\` | \`asc\` or \`desc\` (case-insensitive); default \`desc\` |

Invalid input **throws** an error with \`status: 400\` and a \`fields\` object
mapping the parameter name to a message. Collect **every** problem, not just
the first. Out-of-range numbers are errors, not silently clamped — a client
asking for 5,000 rows should be told no.

Also export \`createServer()\`: \`GET /items\` returns \`200\` with the parsed
options, or \`400\` with \`{ error: 'invalid query', fields }\`.`,
          starter: `import http from 'node:http';

const SORTS = ['createdAt', 'name', 'score'];

export function parsePagination(searchParams) {
  // TODO: parse, validate, collect every failure
}

export function createServer() {
  return http.createServer((req, res) => {
    // TODO
  });
}
`,
          hints: [
            'Accumulate into a `fields = {}` object as you go, and throw once at the end if `Object.keys(fields).length`.',
            'For a strict integer, test the raw string: `/^-?\\d+$/.test(raw)` before converting. `Number("12abc")` is NaN but `parseInt("12abc")` is 12 — that silent truncation is the bug you are preventing.',
            'A missing parameter (`null` from `searchParams.get`) is not an error — it takes the default. Only a *present but invalid* value is.',
            'Normalise the direction with `raw.toLowerCase()` before checking membership.',
          ],
          solution: `import http from 'node:http';

const SORTS = ['createdAt', 'name', 'score'];
const isInteger = (raw) => /^-?\\d+$/.test(raw);

export function parsePagination(searchParams) {
  const fields = {};
  const result = { limit: 20, offset: 0, sort: 'createdAt', direction: 'desc' };

  const rawLimit = searchParams.get('limit');
  if (rawLimit !== null) {
    if (!isInteger(rawLimit)) {
      fields.limit = 'must be an integer';
    } else {
      const value = Number(rawLimit);
      if (value < 1) fields.limit = 'must be at least 1';
      else if (value > 100) fields.limit = 'must be at most 100';
      else result.limit = value;
    }
  }

  const rawOffset = searchParams.get('offset');
  if (rawOffset !== null) {
    if (!isInteger(rawOffset)) fields.offset = 'must be an integer';
    else if (Number(rawOffset) < 0) fields.offset = 'must be at least 0';
    else result.offset = Number(rawOffset);
  }

  const rawSort = searchParams.get('sort');
  if (rawSort !== null) {
    if (!SORTS.includes(rawSort)) fields.sort = 'must be one of ' + SORTS.join(', ');
    else result.sort = rawSort;
  }

  const rawDirection = searchParams.get('direction');
  if (rawDirection !== null) {
    const normalised = rawDirection.toLowerCase();
    if (normalised !== 'asc' && normalised !== 'desc') fields.direction = 'must be asc or desc';
    else result.direction = normalised;
  }

  if (Object.keys(fields).length > 0) {
    const error = new Error('invalid query');
    error.status = 400;
    error.fields = fields;
    throw error;
  }
  return result;
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname !== '/items') return send(404, { error: 'not found' });
    try {
      send(200, parsePagination(url.searchParams));
    } catch (error) {
      send(error.status ?? 500, { error: error.message, fields: error.fields });
    }
  });
}
`,
          tests: `const parse = (query) => solution.parsePagination(new URLSearchParams(query));
const failure = (query) => {
  try {
    parse(query);
    return null;
  } catch (e) { return e; }
};

const start = async () => {
  const server = solution.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    get: (path) => fetch('http://127.0.0.1:' + port + path),
    close: () => new Promise((r) => server.close(r)),
  };
};

describe('defaults', () => {
  it('applies every default for an empty query', () => {
    expect(parse('')).toEqual({ limit: 20, offset: 0, sort: 'createdAt', direction: 'desc' });
  });
  it('parses valid values', () => {
    expect(parse('limit=50&offset=100&sort=name&direction=asc')).toEqual({
      limit: 50, offset: 100, sort: 'name', direction: 'asc',
    });
  });
  it('accepts the boundary values', () => {
    expect(parse('limit=1').limit).toBe(1);
    expect(parse('limit=100').limit).toBe(100);
    expect(parse('offset=0').offset).toBe(0);
  });
  it('accepts direction in any case', () => {
    expect(parse('direction=ASC').direction).toBe('asc');
    expect(parse('direction=Desc').direction).toBe('desc');
  });
  it('ignores unknown parameters', () => {
    expect(parse('utm_source=twitter&limit=5').limit).toBe(5);
  });
});

describe('validation', () => {
  it('rejects a non-numeric limit', () => {
    const err = failure('limit=abc');
    expect(err?.status).toBe(400);
    expect(err.fields.limit).toBeTruthy();
  });

  it('rejects a partially numeric limit rather than truncating it', () => {
    // parseInt("12abc") === 12 is exactly the silent bug we are avoiding.
    expect(failure('limit=12abc')?.status).toBe(400);
  });

  it('rejects a limit below the minimum', () => {
    expect(failure('limit=0')?.fields.limit).toBeTruthy();
    expect(failure('limit=-5')?.fields.limit).toBeTruthy();
  });

  it('rejects a limit above the maximum instead of clamping', () => {
    const err = failure('limit=5000');
    expect(err?.status).toBe(400);
    expect(err.fields.limit).toBeTruthy();
  });

  it('rejects a negative offset', () => {
    expect(failure('offset=-1')?.fields.offset).toBeTruthy();
  });

  it('rejects an unknown sort column', () => {
    const err = failure('sort=password');
    expect(err?.fields.sort).toBeTruthy();
  });

  it('rejects an unknown direction', () => {
    expect(failure('direction=sideways')?.fields.direction).toBeTruthy();
  });

  it('reports every problem at once', () => {
    const err = failure('limit=abc&offset=-2&sort=nope&direction=up');
    expect(err?.status).toBe(400);
    expect(Object.keys(err.fields).sort()).toEqual(['direction', 'limit', 'offset', 'sort']);
  });

  it('does not reject a float-looking limit as valid', () => {
    expect(failure('limit=10.5')?.status).toBe(400);
  });
});

describe('the endpoint', () => {
  it('returns the parsed options', async () => {
    const app = await start();
    try {
      const res = await app.get('/items?limit=5&sort=score');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ limit: 5, offset: 0, sort: 'score', direction: 'desc' });
    } finally { await app.close(); }
  });

  it('returns 400 with the offending fields', async () => {
    const app = await start();
    try {
      const res = await app.get('/items?limit=nope&sort=bad');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('invalid query');
      expect(Object.keys(body.fields).sort()).toEqual(['limit', 'sort']);
    } finally { await app.close(); }
  });
});`,
        },
        {
          id: 'node-error-envelope',
          title: 'One error envelope for the whole API',
          kind: 'node',
          xp: 85,
          why: 'Consistent errors are the difference between a client that handles failure and a client that shows "undefined".',
          tags: ['errors', 'api design', 'security'],
          brief: `Every endpoint inventing its own error shape means every client writes
bespoke parsing. Pick one envelope, map your error types onto it, and never
leak internals.

## Task

Export:

- \`ApiError\` — \`(status, code, message, details?)\`, extending \`Error\`
- \`notFound(resource, id)\` → 404, code \`NOT_FOUND\`
- \`badRequest(message, details)\` → 400, code \`BAD_REQUEST\`
- \`unauthorized()\` → 401, code \`UNAUTHORIZED\`, message \`authentication required\`
- \`toResponse(error, { exposeStack = false })\` → \`{ status, body }\` where body is

\`\`\`json
{ "error": { "code": "NOT_FOUND", "message": "User 42 not found", "details": {} } }
\`\`\`

Rules that matter:

1. An \`ApiError\` maps to its own status, code and message.
2. **Any other** error becomes 500 / \`INTERNAL\` / \`internal server error\` — the
   original message must **not** appear in the body. Database errors leak
   schema names and connection strings.
3. \`details\` is omitted entirely when there is none (not \`null\`).
4. With \`exposeStack: true\` (development only) add a \`stack\` string.

Also export \`handler(fn)\`: wraps an async \`(req, res)\` so any thrown error
becomes the right JSON response.`,
          starter: `export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    // TODO
  }
}

export const notFound = (resource, id) => null;   // TODO
export const badRequest = (message, details) => null;  // TODO
export const unauthorized = () => null;  // TODO

export function toResponse(error, { exposeStack = false } = {}) {
  // TODO
}

export function handler(fn) {
  // TODO
}
`,
          hints: [
            'Set `this.name = "ApiError"` and keep `status`, `code`, `details` as own properties.',
            'Branch on `error instanceof ApiError`. Everything else is a bug you did not anticipate, so it gets the generic 500 body — while you still log the real one.',
            'Build the body then delete the empty parts, or construct conditionally: `...(details ? { details } : {})` inside the object literal.',
            'For `handler`, return `async (req, res) => { try { await fn(req, res) } catch (e) { const { status, body } = toResponse(e); ...respond } }`.',
          ],
          solution: `export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (resource, id) =>
  new ApiError(404, 'NOT_FOUND', resource + ' ' + id + ' not found');

export const badRequest = (message, details) =>
  new ApiError(400, 'BAD_REQUEST', message, details);

export const unauthorized = () =>
  new ApiError(401, 'UNAUTHORIZED', 'authentication required');

export function toResponse(error, { exposeStack = false } = {}) {
  const known = error instanceof ApiError;

  // Unknown errors are never echoed back: their messages leak internals.
  const body = {
    error: {
      code: known ? error.code : 'INTERNAL',
      message: known ? error.message : 'internal server error',
      ...(known && error.details ? { details: error.details } : {}),
      ...(exposeStack && error?.stack ? { stack: error.stack } : {}),
    },
  };

  return { status: known ? error.status : 500, body };
}

export function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      const { status, body } = toResponse(error);
      if (res.writableEnded || res.headersSent) return;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    }
  };
}
`,
          tests: `import http from 'node:http';

describe('ApiError', () => {
  it('is a real Error carrying status, code and details', () => {
    const err = new solution.ApiError(422, 'UNPROCESSABLE', 'nope', { field: 'x' });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(422);
    expect(err.code).toBe('UNPROCESSABLE');
    expect(err.message).toBe('nope');
    expect(err.details).toEqual({ field: 'x' });
    expect(typeof err.stack).toBe('string');
  });
});

describe('the factories', () => {
  it('notFound', () => {
    const err = solution.notFound('User', 42);
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('User 42 not found');
  });
  it('badRequest carries details', () => {
    const err = solution.badRequest('invalid body', { email: 'required' });
    expect(err.status).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.details).toEqual({ email: 'required' });
  });
  it('unauthorized', () => {
    const err = solution.unauthorized();
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('authentication required');
  });
});

describe('toResponse', () => {
  it('maps an ApiError onto the envelope', () => {
    expect(solution.toResponse(solution.notFound('User', 42))).toEqual({
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'User 42 not found' } },
    });
  });

  it('includes details when present', () => {
    const out = solution.toResponse(solution.badRequest('invalid', { email: 'required' }));
    expect(out.body.error.details).toEqual({ email: 'required' });
  });

  it('omits details entirely when there are none', () => {
    const out = solution.toResponse(solution.unauthorized());
    expect('details' in out.body.error).toBe(false);
  });

  it('turns an unexpected error into a generic 500', () => {
    const out = solution.toResponse(new Error('connection to postgres://user:pw@db failed'));
    expect(out.status).toBe(500);
    expect(out.body.error.code).toBe('INTERNAL');
    expect(out.body.error.message).toBe('internal server error');
  });

  it('never leaks an internal message or stack by default', () => {
    const dbError = new Error('relation "secret_users" does not exist');
    const out = solution.toResponse(dbError);
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain('secret_users');
    expect(serialised).not.toContain('stack');
  });

  it('handles a thrown non-Error', () => {
    const out = solution.toResponse('just a string');
    expect(out.status).toBe(500);
    expect(out.body.error.code).toBe('INTERNAL');
  });

  it('exposes the stack only when asked', () => {
    const out = solution.toResponse(new Error('boom'), { exposeStack: true });
    expect(typeof out.body.error.stack).toBe('string');
    expect(out.body.error.stack.length).toBeGreaterThan(0);
  });
});

describe('handler', () => {
  const start = async (fn) => {
    const server = http.createServer(solution.handler(fn));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    return {
      get: () => fetch('http://127.0.0.1:' + port + '/'),
      close: () => new Promise((r) => server.close(r)),
    };
  };

  it('leaves a successful response alone', async () => {
    const app = await start(async (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally { await app.close(); }
  });

  it('turns a thrown ApiError into its response', async () => {
    const app = await start(async () => { throw solution.notFound('Post', 9); });
    try {
      const res = await app.get();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: { code: 'NOT_FOUND', message: 'Post 9 not found' },
      });
    } finally { await app.close(); }
  });

  it('turns an unexpected throw into a safe 500', async () => {
    const app = await start(async () => { throw new Error('internal detail'); });
    try {
      const res = await app.get();
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.message).toBe('internal server error');
      expect(JSON.stringify(body)).not.toContain('internal detail');
    } finally { await app.close(); }
  });

  it('does not try to respond twice if the handler already replied', async () => {
    const app = await start(async (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ sent: true }));
      throw new Error('too late');
    });
    try {
      const res = await app.get();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ sent: true });
    } finally { await app.close(); }
  });
});`,
        },
        {
          id: 'node-signed-tokens',
          title: 'Signed tokens with node:crypto',
          kind: 'node',
          xp: 100,
          why: 'You will be asked how sessions work. "The token is signed, not encrypted" is the answer, and this is why.',
          tags: ['crypto', 'auth', 'security'],
          brief: `A signed token is \`payload.signature\`. Anyone can read the payload —
signing proves it was not *changed*, not that it is secret. Getting the
verification wrong is how auth bypasses happen.

## Task

Export \`createTokens({ secret, ttlMs = 3600_000, now = Date.now })\` returning
\`{ sign, verify }\`.

- \`sign(payload)\` → \`\`\`\`<base64url json>.<base64url hmac>\`\`\`\`. The payload gets an
  \`exp\` timestamp (\`now() + ttlMs\`) added before signing.
- \`verify(token)\` → the payload, or **throws**:
  - \`invalid token\` — wrong shape, unparseable, or bad base64
  - \`bad signature\` — the signature does not match
  - \`token expired\` — \`exp\` is at or before \`now()\`

Requirements:

1. HMAC-SHA256 via \`node:crypto\`, over the encoded payload segment.
2. Compare signatures with \`crypto.timingSafeEqual\`, not \`===\`. A byte-by-byte
   early return leaks the signature one character at a time.
3. Tampering with the payload must fail with \`bad signature\` — check the
   signature **before** trusting anything in the payload.
4. Base64**url** (no \`+\`, \`/\` or \`=\`), because tokens travel in URLs.`,
          starter: `import crypto from 'node:crypto';

export function createTokens({ secret, ttlMs = 3600_000, now = Date.now }) {
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

  const signature = (data) => {
    // TODO: HMAC-SHA256, base64url
  };

  return {
    sign(payload) {
      // TODO
    },
    verify(token) {
      // TODO
    },
  };
}
`,
          hints: [
            "`crypto.createHmac('sha256', secret).update(data).digest('base64url')` is the whole signing step.",
            "Node's Buffer supports 'base64url' directly — `Buffer.from(str, 'base64url').toString('utf8')` to decode.",
            '`timingSafeEqual` throws if the two buffers differ in length, so compare lengths first and return false rather than letting it throw.',
            'Order of checks in verify: split into exactly two parts → recompute and compare the signature → only then parse the payload and check `exp`. Reversing the last two lets an attacker act on a payload you have not authenticated.',
            'Wrap the JSON parse in try/catch and throw your own `invalid token` error, so a malformed payload never surfaces a SyntaxError.',
          ],
          solution: `import crypto from 'node:crypto';

export function createTokens({ secret, ttlMs = 3600_000, now = Date.now }) {
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

  const signature = (data) =>
    crypto.createHmac('sha256', secret).update(data).digest('base64url');

  const sameSignature = (a, b) => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    // timingSafeEqual throws on a length mismatch, so screen that out first.
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
  };

  return {
    sign(payload) {
      const body = encode({ ...payload, exp: now() + ttlMs });
      return body + '.' + signature(body);
    },

    verify(token) {
      if (typeof token !== 'string') throw new Error('invalid token');
      const parts = token.split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('invalid token');

      const [body, provided] = parts;

      // Authenticate before parsing: never act on an unverified payload.
      if (!sameSignature(provided, signature(body))) throw new Error('bad signature');

      let payload;
      try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      } catch {
        throw new Error('invalid token');
      }
      if (typeof payload !== 'object' || payload === null) throw new Error('invalid token');
      if (typeof payload.exp !== 'number') throw new Error('invalid token');
      if (payload.exp <= now()) throw new Error('token expired');

      return payload;
    },
  };
}
`,
          tests: `import crypto from 'node:crypto';

const secret = 'a-very-secret-key';

describe('sign', () => {
  it('produces two base64url segments', () => {
    const { sign } = solution.createTokens({ secret });
    const token = sign({ userId: 7 });
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
    expect(token).not.toContain('=');
  });

  it('embeds the payload readably (signed, not encrypted)', () => {
    const { sign } = solution.createTokens({ secret });
    const token = sign({ userId: 7, role: 'admin' });
    const decoded = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    expect(decoded.userId).toBe(7);
    expect(decoded.role).toBe('admin');
  });

  it('adds an expiry from now + ttl', () => {
    const { sign } = solution.createTokens({ secret, ttlMs: 5000, now: () => 1_000_000 });
    const token = sign({ userId: 1 });
    const decoded = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    expect(decoded.exp).toBe(1_005_000);
  });
});

describe('verify', () => {
  it('round-trips a payload', () => {
    const { sign, verify } = solution.createTokens({ secret });
    const payload = verify(sign({ userId: 7, role: 'admin' }));
    expect(payload.userId).toBe(7);
    expect(payload.role).toBe('admin');
  });

  it('rejects a token signed with a different secret', () => {
    const mint = solution.createTokens({ secret: 'attacker-key' });
    const check = solution.createTokens({ secret });
    expect(() => check.verify(mint.sign({ userId: 1 }))).toThrow('bad signature');
  });

  it('rejects a tampered payload', () => {
    const { sign, verify } = solution.createTokens({ secret });
    const token = sign({ userId: 7, role: 'user' });
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ userId: 7, role: 'admin', exp: Date.now() + 10000 }))
      .toString('base64url');
    expect(() => verify(forged + '.' + sig)).toThrow('bad signature');
  });

  it('rejects a truncated signature', () => {
    const { sign, verify } = solution.createTokens({ secret });
    const token = sign({ userId: 1 });
    const [body, sig] = token.split('.');
    expect(() => verify(body + '.' + sig.slice(0, -4))).toThrow('bad signature');
  });

  it('rejects malformed tokens', () => {
    const { verify } = solution.createTokens({ secret });
    for (const bad of ['', 'nodot', 'a.b.c', '.sig', 'body.', 'undefined']) {
      expect(() => verify(bad)).toThrow();
    }
  });

  it('rejects a non-string', () => {
    const { verify } = solution.createTokens({ secret });
    expect(() => verify(null)).toThrow('invalid token');
    expect(() => verify(undefined)).toThrow('invalid token');
  });

  it('rejects a payload that is valid base64 but not JSON', () => {
    const { verify } = solution.createTokens({ secret });
    const body = Buffer.from('not json at all').toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    expect(() => verify(body + '.' + sig)).toThrow('invalid token');
  });

  it('rejects an expired token', () => {
    let clock = 1_000_000;
    const { sign, verify } = solution.createTokens({ secret, ttlMs: 1000, now: () => clock });
    const token = sign({ userId: 1 });
    expect(verify(token).userId).toBe(1);
    clock += 1001;
    expect(() => verify(token)).toThrow('token expired');
  });

  it('treats the exact expiry moment as expired', () => {
    let clock = 1_000_000;
    const { sign, verify } = solution.createTokens({ secret, ttlMs: 1000, now: () => clock });
    const token = sign({ userId: 1 });
    clock += 1000;
    expect(() => verify(token)).toThrow('token expired');
  });

  it('checks the signature before the expiry', () => {
    // An expired token with a bad signature must report the signature problem:
    // you cannot trust exp until you know the payload is authentic.
    let clock = 1_000_000;
    const mint = solution.createTokens({ secret: 'wrong', ttlMs: 10, now: () => clock });
    const check = solution.createTokens({ secret, ttlMs: 10, now: () => clock });
    const token = mint.sign({ userId: 1 });
    clock += 1000;
    expect(() => check.verify(token)).toThrow('bad signature');
  });

  it('uses a timing-safe comparison', () => {
    const original = crypto.timingSafeEqual;
    let used = 0;
    crypto.timingSafeEqual = (...args) => { used++; return original(...args); };
    try {
      const { sign, verify } = solution.createTokens({ secret });
      verify(sign({ userId: 1 }));
    } finally {
      crypto.timingSafeEqual = original;
    }
    expect(used).toBeGreaterThan(0);
  });
});`,
        },
        {
          id: 'node-rate-limit',
          title: 'A rate limiter that tells the truth',
          kind: 'node',
          xp: 95,
          why: 'The cheapest protection you can add to an API, and the headers are half the value.',
          tags: ['rate limiting', 'middleware', 'api design'],
          brief: `A fixed window (\`60 requests per minute\`) is simple but lets a client
send 120 requests across a window boundary. A **sliding window** or **token
bucket** smooths that out. You will build a token bucket, which also allows a
sensible burst.

## Task

Export \`createRateLimiter({ capacity, refillPerSecond, now = Date.now })\`
returning \`{ check(key) }\`.

\`check\` returns
\`{ allowed, remaining, limit, retryAfterMs }\`:

- each key gets its own bucket, starting full
- an allowed request costs one token
- tokens refill continuously at \`refillPerSecond\` (fractional time counts —
  half a second at 2/s is one token), never exceeding \`capacity\`
- when refused, \`retryAfterMs\` is the whole milliseconds until one token is
  available; \`0\` when allowed
- \`remaining\` is the floor of the tokens left

Then export \`rateLimit(limiter, keyOf)\`: middleware
\`(req, res, next)\` that sets \`x-ratelimit-limit\` and
\`x-ratelimit-remaining\` on every response, and on refusal responds \`429\` with
a \`retry-after\` header **in seconds** (rounded up) and body
\`{"error":"too many requests"}\`.`,
          starter: `export function createRateLimiter({ capacity, refillPerSecond, now = Date.now }) {
  const buckets = new Map();

  return {
    check(key) {
      // TODO
    },
  };
}

export function rateLimit(limiter, keyOf = (req) => req.socket?.remoteAddress ?? 'anonymous') {
  return (req, res, next) => {
    // TODO
  };
}
`,
          hints: [
            'Store `{ tokens, lastRefill }` per key. On each check, first refill: `const elapsed = now() - lastRefill; tokens = Math.min(capacity, tokens + (elapsed / 1000) * refillPerSecond)`.',
            'Keep tokens as a float. Rounding to integers loses the partial refill and makes the limiter drift.',
            'Always update `lastRefill` to the current time after refilling, whether or not the request is allowed.',
            'For `retryAfterMs`, the deficit is `1 - tokens`; the wait is `(deficit / refillPerSecond) * 1000`, rounded up with `Math.ceil`.',
            'Headers must be set *before* `res.writeHead` for the 429, and also on the success path before calling `next()`.',
          ],
          solution: `export function createRateLimiter({ capacity, refillPerSecond, now = Date.now }) {
  const buckets = new Map();

  return {
    check(key) {
      const timestamp = now();
      const bucket = buckets.get(key) ?? { tokens: capacity, lastRefill: timestamp };

      // Continuous refill: keep tokens fractional so partial time still counts.
      const elapsedSeconds = (timestamp - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSeconds * refillPerSecond);
      bucket.lastRefill = timestamp;

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        buckets.set(key, bucket);
        return {
          allowed: true,
          remaining: Math.floor(bucket.tokens),
          limit: capacity,
          retryAfterMs: 0,
        };
      }

      buckets.set(key, bucket);
      const deficit = 1 - bucket.tokens;
      return {
        allowed: false,
        remaining: 0,
        limit: capacity,
        retryAfterMs: Math.ceil((deficit / refillPerSecond) * 1000),
      };
    },
  };
}

export function rateLimit(limiter, keyOf = (req) => req.socket?.remoteAddress ?? 'anonymous') {
  return (req, res, next) => {
    const result = limiter.check(keyOf(req));

    res.setHeader('x-ratelimit-limit', String(result.limit));
    res.setHeader('x-ratelimit-remaining', String(result.remaining));

    if (result.allowed) return next();

    res.setHeader('retry-after', String(Math.ceil(result.retryAfterMs / 1000)));
    res.writeHead(429, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'too many requests' }));
  };
}
`,
          tests: `import http from 'node:http';

describe('the bucket', () => {
  it('allows a burst up to capacity', () => {
    const limiter = solution.createRateLimiter({ capacity: 3, refillPerSecond: 1, now: () => 0 });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('reports remaining and limit', () => {
    const limiter = solution.createRateLimiter({ capacity: 2, refillPerSecond: 1, now: () => 0 });
    expect(limiter.check('a')).toEqual({ allowed: true, remaining: 1, limit: 2, retryAfterMs: 0 });
    expect(limiter.check('a')).toEqual({ allowed: true, remaining: 0, limit: 2, retryAfterMs: 0 });
    const refused = limiter.check('a');
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.limit).toBe(2);
  });

  it('keeps buckets separate per key', () => {
    const limiter = solution.createRateLimiter({ capacity: 1, refillPerSecond: 1, now: () => 0 });
    expect(limiter.check('alice').allowed).toBe(true);
    expect(limiter.check('alice').allowed).toBe(false);
    expect(limiter.check('bob').allowed).toBe(true);
  });

  it('refills over time', () => {
    let clock = 0;
    const limiter = solution.createRateLimiter({ capacity: 2, refillPerSecond: 1, now: () => clock });
    limiter.check('a');
    limiter.check('a');
    expect(limiter.check('a').allowed).toBe(false);
    clock += 1000;
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('counts fractional time', () => {
    let clock = 0;
    const limiter = solution.createRateLimiter({ capacity: 1, refillPerSecond: 2, now: () => clock });
    expect(limiter.check('a').allowed).toBe(true);
    clock += 250;   // half a token at 2/s
    expect(limiter.check('a').allowed).toBe(false);
    clock += 250;   // now a full token
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('never refills past capacity', () => {
    let clock = 0;
    const limiter = solution.createRateLimiter({ capacity: 2, refillPerSecond: 10, now: () => clock });
    clock += 60_000;
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('reports how long to wait', () => {
    let clock = 0;
    const limiter = solution.createRateLimiter({ capacity: 1, refillPerSecond: 1, now: () => clock });
    limiter.check('a');
    expect(limiter.check('a').retryAfterMs).toBe(1000);
    clock += 400;
    expect(limiter.check('a').retryAfterMs).toBe(600);
  });
});

describe('the middleware', () => {
  const start = async (limiter) => {
    const middleware = solution.rateLimit(limiter, () => 'test-key');
    const server = http.createServer((req, res) => {
      middleware(req, res, () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    return {
      get: () => fetch('http://127.0.0.1:' + port + '/'),
      close: () => new Promise((r) => server.close(r)),
    };
  };

  it('passes allowed requests through with headers', async () => {
    const app = await start(solution.createRateLimiter({ capacity: 5, refillPerSecond: 1, now: () => 0 }));
    try {
      const res = await app.get();
      expect(res.status).toBe(200);
      expect(res.headers.get('x-ratelimit-limit')).toBe('5');
      expect(res.headers.get('x-ratelimit-remaining')).toBe('4');
      expect(await res.json()).toEqual({ ok: true });
    } finally { await app.close(); }
  });

  it('counts down remaining', async () => {
    const app = await start(solution.createRateLimiter({ capacity: 3, refillPerSecond: 1, now: () => 0 }));
    try {
      expect((await app.get()).headers.get('x-ratelimit-remaining')).toBe('2');
      expect((await app.get()).headers.get('x-ratelimit-remaining')).toBe('1');
      expect((await app.get()).headers.get('x-ratelimit-remaining')).toBe('0');
    } finally { await app.close(); }
  });

  it('429s with retry-after in seconds once exhausted', async () => {
    const app = await start(solution.createRateLimiter({ capacity: 1, refillPerSecond: 0.5, now: () => 0 }));
    try {
      expect((await app.get()).status).toBe(200);
      const res = await app.get();
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('2');
      expect(res.headers.get('x-ratelimit-remaining')).toBe('0');
      expect(await res.json()).toEqual({ error: 'too many requests' });
    } finally { await app.close(); }
  });

  it('sets the limit headers on a refusal too', async () => {
    const app = await start(solution.createRateLimiter({ capacity: 1, refillPerSecond: 1, now: () => 0 }));
    try {
      await app.get();
      const res = await app.get();
      expect(res.headers.get('x-ratelimit-limit')).toBe('1');
    } finally { await app.close(); }
  });

  it('lets traffic through again after a refill', async () => {
    let clock = 0;
    const app = await start(solution.createRateLimiter({
      capacity: 1, refillPerSecond: 1000, now: () => clock,
    }));
    try {
      expect((await app.get()).status).toBe(200);
      expect((await app.get()).status).toBe(429);
      clock += 10;
      expect((await app.get()).status).toBe(200);
    } finally { await app.close(); }
  });
});`,
        },
      ],
    },

    /* ================================================================== */
    {
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
          brief: `Chunks do not respect line boundaries: a JSON object can be split across
two reads. Any line-oriented parser must buffer the partial tail and wait.

## Task

Export \`createNdjsonParser()\`, a \`Transform\` stream in object mode that takes
raw chunks and emits one parsed object per line.

- handle a line split across chunk boundaries
- skip blank lines
- a malformed line emits an \`error\` on the stream
- flush any final line that has no trailing newline

Then export \`sumField(source, field)\`: consumes a readable of NDJSON and
resolves to the sum of that field across all records.`,
          starter: `import { Transform } from 'node:stream';

export function createNdjsonParser() {
  let buffer = '';
  return new Transform({
    readableObjectMode: true,
    transform(chunk, _encoding, callback) {
      // TODO: append, split on newlines, keep the remainder
    },
    flush(callback) {
      // TODO: the last line may have no newline
    },
  });
}

export async function sumField(source, field) {
  // TODO
}
`,
          hints: [
            'Keep a `buffer` string in the closure. Each transform: `buffer += chunk; const lines = buffer.split("\\n"); buffer = lines.pop();` — `pop` leaves the (possibly incomplete) tail behind.',
            '`this.push(parsed)` emits a record downstream. Call `callback()` once at the end of transform, or `callback(error)` to fail the stream.',
            'In `flush`, process whatever is left in the buffer before calling back — that is the line with no trailing newline.',
            'For `sumField`, `for await (const record of source.pipe(createNdjsonParser()))` — piping returns the destination, which is async-iterable.',
            'Remember `\\r`: a file written on Windows has `\\r\\n` line endings, so trim each line before parsing.',
          ],
          solution: `import { Transform } from 'node:stream';

export function createNdjsonParser() {
  let buffer = '';

  const emit = (stream, line, callback) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    try {
      stream.push(JSON.parse(trimmed));
      return true;
    } catch {
      callback(new Error('invalid json on line: ' + trimmed.slice(0, 60)));
      return false;
    }
  };

  return new Transform({
    readableObjectMode: true,

    transform(chunk, _encoding, callback) {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\\n');
      // The last element is an incomplete line (or ''), so hold it back.
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!emit(this, line, callback)) return;
      }
      callback();
    },

    flush(callback) {
      if (buffer.trim()) {
        if (!emit(this, buffer, callback)) return;
      }
      buffer = '';
      callback();
    },
  });
}

export async function sumField(source, field) {
  let total = 0;
  for await (const record of source.pipe(createNdjsonParser())) {
    total += record[field] ?? 0;
  }
  return total;
}
`,
          tests: `import { Readable } from 'node:stream';

const from = (chunks) => Readable.from(chunks.map((c) => Buffer.from(c)));

const collect = async (chunks) => {
  const out = [];
  for await (const record of from(chunks).pipe(solution.createNdjsonParser())) out.push(record);
  return out;
};

describe('createNdjsonParser', () => {
  it('parses one record per line', async () => {
    const out = await collect(['{"a":1}\\n{"a":2}\\n']);
    expect(out).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('handles a record split across chunks', async () => {
    const out = await collect(['{"name":"a', 'da","id":', '1}\\n']);
    expect(out).toEqual([{ name: 'ada', id: 1 }]);
  });

  it('handles a newline arriving in its own chunk', async () => {
    const out = await collect(['{"a":1}', '\\n', '{"a":2}\\n']);
    expect(out).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('flushes a final line with no trailing newline', async () => {
    const out = await collect(['{"a":1}\\n{"a":2}']);
    expect(out).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('skips blank lines', async () => {
    const out = await collect(['{"a":1}\\n\\n\\n{"a":2}\\n\\n']);
    expect(out).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('tolerates Windows line endings', async () => {
    const out = await collect(['{"a":1}\\r\\n{"a":2}\\r\\n']);
    expect(out).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('handles an empty stream', async () => {
    expect(await collect([''])).toEqual([]);
  });

  it('emits an error for a malformed line', async () => {
    let caught;
    try {
      await collect(['{"a":1}\\n{not json}\\n{"a":3}\\n']);
    } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect(caught.message).toContain('invalid json');
  });

  it('parses a large stream without buffering it whole', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => JSON.stringify({ i }) + '\\n');
    const out = await collect(lines);
    expect(out).toHaveLength(500);
    expect(out[499]).toEqual({ i: 499 });
  });

  it('emits objects, not strings', async () => {
    const out = await collect(['{"a":1}\\n']);
    expect(typeof out[0]).toBe('object');
  });
});

describe('sumField', () => {
  it('sums a field across records', async () => {
    const source = from(['{"amount":10}\\n{"amount":32}\\n{"amount":0.5}\\n']);
    expect(await solution.sumField(source, 'amount')).toBe(42.5);
  });

  it('treats a missing field as 0', async () => {
    const source = from(['{"amount":10}\\n{"other":99}\\n']);
    expect(await solution.sumField(source, 'amount')).toBe(10);
  });

  it('returns 0 for an empty source', async () => {
    expect(await solution.sumField(from(['']), 'amount')).toBe(0);
  });

  it('rejects on malformed input', async () => {
    await expect(solution.sumField(from(['{"amount":1}\\noops\\n']), 'amount')).rejects.toThrow();
  });
});`,
        },
        {
          id: 'node-graceful-shutdown',
          title: 'Shutting down without dropping requests',
          kind: 'node',
          xp: 90,
          why: 'Every deploy sends SIGTERM. Without this, every deploy 502s whoever was mid-request.',
          tags: ['lifecycle', 'operations', 'http'],
          brief: `\`process.exit()\` on SIGTERM kills in-flight requests. A graceful shutdown
happens in two phases, and the order matters:

1. **Start refusing.** Mark yourself unhealthy and answer new requests with
   \`503\`, while the listener stays open. The load balancer notices and stops
   routing to you.
2. **Close and drain.** Stop accepting connections, let in-flight requests
   finish, then exit — with a hard timeout, so one stuck request cannot block
   the deploy forever.

Skipping phase 1 and calling \`server.close()\` straight away is the common
mistake: the socket stops accepting, so anything the balancer sends in the next
few milliseconds gets a connection error instead of a clean \`503\`.

## Task

Export \`createGracefulServer({ requestHandler, drainTimeoutMs = 5000 })\`
returning \`{ server, beginShutdown, shutdown, isShuttingDown, activeRequests }\`.

- \`server\` is a real \`http.Server\` running \`requestHandler\`
- \`activeRequests\` counts requests currently being handled
- \`beginShutdown()\` flips \`isShuttingDown\`; from then on **new** requests get
  \`503\` with a \`connection: close\` header and body
  \`{"error":"server is shutting down"}\`. Calling it twice changes nothing.
  The listener stays open.
- \`shutdown()\` runs \`beginShutdown()\`, closes the listener, waits for in-flight
  requests, and resolves \`{ ok: true, forced: false }\`
- if requests are still running after \`drainTimeoutMs\`, resolve
  \`{ ok: true, forced: true }\` rather than hanging
- calling \`shutdown()\` twice returns the same promise, not a second teardown`,
          starter: `import http from 'node:http';

export function createGracefulServer({ requestHandler, drainTimeoutMs = 5000 }) {
  let active = 0;
  let shuttingDown = false;
  let shutdownPromise = null;

  const server = http.createServer((req, res) => {
    // TODO: refuse when shutting down, otherwise count the request
  });

  return {
    server,
    get activeRequests() { return active; },
    get isShuttingDown() { return shuttingDown; },
    beginShutdown() {
      // TODO
    },
    shutdown() {
      // TODO: begin, close the listener, drain, or force after the timeout
    },
  };
}
`,
          hints: [
            "Track completion with `res.on('close', ...)` — it fires whether the response finished or the client hung up, which `res.on('finish')` does not.",
            'Increment before calling the handler and decrement in the close listener, so even a synchronous handler is counted.',
            'Memoise: `shutdown() { if (shutdownPromise) return shutdownPromise; shutdownPromise = (async () => { ... })(); return shutdownPromise; }`.',
            '`server.close(cb)` stops accepting new connections and calls back once existing ones end. Race it against a timer with `Promise.race`.',
            'To wait for the drain, poll: a `setInterval` every 10 ms that resolves once `active === 0` is perfectly adequate and easy to reason about.',
            'Keep-alive sockets can keep `server.close()` waiting even with no active requests. `server.closeIdleConnections?.()` after closing releases them, which is why a real shutdown reaches the drained state instead of the forced one.',
          ],
          solution: `import http from 'node:http';

export function createGracefulServer({ requestHandler, drainTimeoutMs = 5000 }) {
  let active = 0;
  let shuttingDown = false;
  let shutdownPromise = null;

  const server = http.createServer((req, res) => {
    if (shuttingDown) {
      res.writeHead(503, { 'content-type': 'application/json', connection: 'close' });
      res.end(JSON.stringify({ error: 'server is shutting down' }));
      return;
    }

    active++;
    // 'close' fires on completion *and* on client disconnect; 'finish' misses the latter.
    res.on('close', () => { active--; });

    requestHandler(req, res);
  });

  const waitForDrain = () => new Promise((resolve) => {
    if (active === 0) return resolve();
    const interval = setInterval(() => {
      if (active === 0) {
        clearInterval(interval);
        resolve();
      }
    }, 10);
  });

  return {
    server,
    get activeRequests() { return active; },
    get isShuttingDown() { return shuttingDown; },

    beginShutdown() {
      // Phase one: still listening, but answering 503 so the balancer can react.
      shuttingDown = true;
    },

    shutdown() {
      if (shutdownPromise) return shutdownPromise;
      shuttingDown = true;

      shutdownPromise = (async () => {
        const closed = new Promise((resolve) => server.close(() => resolve()));
        // Idle keep-alive sockets would otherwise hold close() open for their
        // full timeout, turning a clean shutdown into a forced one.
        server.closeIdleConnections?.();

        let timer;
        const timedOut = new Promise((resolve) => {
          timer = setTimeout(() => resolve('forced'), drainTimeoutMs);
        });

        const outcome = await Promise.race([
          Promise.all([closed, waitForDrain()]).then(() => 'drained'),
          timedOut,
        ]);
        clearTimeout(timer);

        if (outcome === 'forced') {
          server.closeAllConnections?.();
          return { ok: true, forced: true };
        }
        return { ok: true, forced: false };
      })();

      return shutdownPromise;
    },
  };
}
`,
          tests: `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const start = async (handler, options = {}) => {
  const app = solution.createGracefulServer({ requestHandler: handler, ...options });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const { port } = app.server.address();
  // Delegate rather than spread: spreading would freeze the getters at 0/false.
  return {
    server: app.server,
    beginShutdown: () => app.beginShutdown(),
    shutdown: () => app.shutdown(),
    get activeRequests() { return app.activeRequests; },
    get isShuttingDown() { return app.isShuttingDown; },
    get: (path = '/') => fetch('http://127.0.0.1:' + port + path),
  };
};

const ok = (req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
};

describe('normal operation', () => {
  it('serves requests', async () => {
    const app = await start(ok);
    try {
      const res = await app.get();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally { await app.shutdown(); }
  });

  it('starts not shutting down, with no active requests', async () => {
    const app = await start(ok);
    try {
      expect(app.isShuttingDown).toBe(false);
      expect(app.activeRequests).toBe(0);
    } finally { await app.shutdown(); }
  });

  it('counts in-flight requests', async () => {
    let release;
    const app = await start(async (req, res) => {
      await new Promise((r) => { release = r; });
      ok(req, res);
    });
    try {
      const pending = app.get();
      await sleep(40);
      expect(app.activeRequests).toBe(1);
      release();
      await pending;
      await sleep(20);
      expect(app.activeRequests).toBe(0);
    } finally { await app.shutdown(); }
  });
});

describe('phase one: refusing while still listening', () => {
  it('answers new requests with 503', async () => {
    const app = await start(ok);
    try {
      expect((await app.get()).status).toBe(200);
      app.beginShutdown();
      const res = await app.get();
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'server is shutting down' });
    } finally { await app.shutdown(); }
  });

  it('asks the client to close the connection', async () => {
    const app = await start(ok);
    try {
      app.beginShutdown();
      const res = await app.get();
      expect(res.headers.get('connection')).toBe('close');
    } finally { await app.shutdown(); }
  });

  it('reports isShuttingDown', async () => {
    const app = await start(ok);
    try {
      app.beginShutdown();
      expect(app.isShuttingDown).toBe(true);
    } finally { await app.shutdown(); }
  });

  it('is idempotent', async () => {
    const app = await start(ok);
    try {
      app.beginShutdown();
      app.beginShutdown();
      expect((await app.get()).status).toBe(503);
    } finally { await app.shutdown(); }
  });

  it('does not count refused requests as active', async () => {
    const app = await start(ok);
    try {
      app.beginShutdown();
      await app.get();
      await sleep(20);
      expect(app.activeRequests).toBe(0);
    } finally { await app.shutdown(); }
  });

  it('still lets an already-running request finish', async () => {
    let release;
    const app = await start(async (req, res) => {
      if (req.url === '/slow') await new Promise((r) => { release = r; });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ path: req.url }));
    });
    const pending = app.get('/slow');
    await sleep(40);

    app.beginShutdown();
    expect((await app.get('/new')).status).toBe(503);

    release();
    const res = await pending;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: '/slow' });
    await app.shutdown();
  });
});

describe('phase two: closing and draining', () => {
  it('resolves cleanly with nothing in flight', async () => {
    const app = await start(ok);
    const result = await app.shutdown();
    expect(result).toEqual({ ok: true, forced: false });
    expect(app.isShuttingDown).toBe(true);
  });

  it('implies beginShutdown', async () => {
    const app = await start(ok);
    const shutting = app.shutdown();
    expect(app.isShuttingDown).toBe(true);
    await shutting;
  });

  it('lets an in-flight request finish', async () => {
    let release;
    const app = await start(async (req, res) => {
      await new Promise((r) => { release = r; });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ finished: true }));
    });

    const pending = app.get();
    await sleep(40);

    const shutting = app.shutdown();
    await sleep(20);
    release();

    const res = await pending;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ finished: true });

    const result = await shutting;
    expect(result.forced).toBe(false);
  });

  it('gives up after the drain timeout instead of hanging', async () => {
    const app = await start(
      async () => { await sleep(10_000); },
      { drainTimeoutMs: 80 },
    );
    app.get().catch(() => {});
    await sleep(40);

    const started = Date.now();
    const result = await app.shutdown();
    const elapsed = Date.now() - started;

    expect(result).toEqual({ ok: true, forced: true });
    expect(elapsed).toBeLessThan(1500);
  });

  it('returns the same promise when called twice', async () => {
    const app = await start(ok);
    const first = app.shutdown();
    const second = app.shutdown();
    expect(first).toBe(second);
    await first;
  });

  it('stops listening once shut down', async () => {
    const app = await start(ok);
    await app.shutdown();
    await expect(app.get()).rejects.toThrow();
  });
});
`,
        },
        {
          id: 'node-layering',
          title: 'Handlers, services, repositories',
          kind: 'node',
          xp: 95,
          why: 'The structural difference between a codebase you can test and one where every test needs a database.',
          tags: ['architecture', 'dependency injection', 'testability'],
          brief: `The reason a codebase becomes untestable is business logic married to
\`req\`/\`res\` and to the database driver. Three layers fix it:

- **repository** — data access only, no rules
- **service** — the rules, taking the repository as a dependency
- **handler** — HTTP only: read the request, call the service, choose a status

The service is where the value is, and it becomes testable with a fake
repository and no server at all.

## Task

Export:

- \`createUserService({ users, now = () => new Date('2024-01-01') })\` returning
  \`{ register, getById, deactivate, list }\`

  - \`register({ email, name })\` — lowercases and trims the email, rejects an
    invalid one (\`ValidationError\`), rejects a duplicate (\`ConflictError\`),
    and stores \`{ email, name, active: true, createdAt: now() }\`
  - \`getById(id)\` — the user, or throws \`NotFoundError\`
  - \`deactivate(id)\` — sets \`active: false\`, returns the updated user, throws
    \`NotFoundError\` if missing, and is **idempotent**
  - \`list({ activeOnly })\` — all users, or only active ones

- \`createMemoryUserRepo()\` — \`{ insert, findById, findByEmail, update, all }\`
  with auto-incrementing string ids starting at \`'1'\`
- \`ValidationError\`, \`ConflictError\`, \`NotFoundError\`
- \`createUserHandler(service)\` — \`(req, res)\` mapping
  \`POST /users\` → 201, \`GET /users/:id\` → 200,
  \`DELETE /users/:id\` → 200, \`GET /users\` → 200, with
  \`ValidationError\` → 400, \`ConflictError\` → 409, \`NotFoundError\` → 404`,
          starter: `import http from 'node:http';

export class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}
export class ConflictError extends Error {
  constructor(message) { super(message); this.name = 'ConflictError'; }
}
export class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; }
}

export function createMemoryUserRepo() {
  // TODO: a Map, a counter, and the five methods
}

export function createUserService({ users, now = () => new Date('2024-01-01') }) {
  // TODO: the rules live here, and only here
}

export function createUserHandler(service) {
  return async (req, res) => {
    // TODO: HTTP only
  };
}
`,
          hints: [
            'Keep the repository dumb: `insert(data)` assigns the next id and stores; it must not validate anything. That is the service\'s job.',
            'Validate the email with something simple and honest: a non-empty string containing `@` with characters either side. Do not attempt a full RFC regex.',
            'Normalise before checking for duplicates, or `Ada@X.com` and `ada@x.com` both register.',
            'Idempotent `deactivate` means: if already inactive, return it unchanged rather than throwing.',
            'The handler should hold no rules — just parse, call, and translate errors to statuses with a small map from error name to status code.',
          ],
          solution: `import http from 'node:http';

export class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}
export class ConflictError extends Error {
  constructor(message) { super(message); this.name = 'ConflictError'; }
}
export class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; }
}

export function createMemoryUserRepo() {
  const rows = new Map();
  let nextId = 1;

  // Data access only: no validation, no rules.
  return {
    async insert(data) {
      const id = String(nextId++);
      const row = { id, ...data };
      rows.set(id, row);
      return row;
    },
    async findById(id) {
      return rows.get(String(id)) ?? null;
    },
    async findByEmail(email) {
      return [...rows.values()].find((row) => row.email === email) ?? null;
    },
    async update(id, patch) {
      const existing = rows.get(String(id));
      if (!existing) return null;
      const updated = { ...existing, ...patch };
      rows.set(String(id), updated);
      return updated;
    },
    async all() {
      return [...rows.values()];
    },
  };
}

const isEmail = (value) =>
  typeof value === 'string' && /^[^\\s@]+@[^\\s@]+$/.test(value.trim());

export function createUserService({ users, now = () => new Date('2024-01-01') }) {
  return {
    async register({ email, name } = {}) {
      if (!isEmail(email)) throw new ValidationError('a valid email is required');
      if (typeof name !== 'string' || !name.trim()) throw new ValidationError('name is required');

      const normalised = email.trim().toLowerCase();
      if (await users.findByEmail(normalised)) {
        throw new ConflictError('email already registered');
      }

      return users.insert({
        email: normalised,
        name: name.trim(),
        active: true,
        createdAt: now(),
      });
    },

    async getById(id) {
      const user = await users.findById(id);
      if (!user) throw new NotFoundError('user ' + id + ' not found');
      return user;
    },

    async deactivate(id) {
      const user = await users.findById(id);
      if (!user) throw new NotFoundError('user ' + id + ' not found');
      if (!user.active) return user;   // idempotent
      return users.update(id, { active: false });
    },

    async list({ activeOnly = false } = {}) {
      const all = await users.all();
      return activeOnly ? all.filter((user) => user.active) : all;
    },
  };
}

const STATUS_BY_ERROR = {
  ValidationError: 400,
  ConflictError: 409,
  NotFoundError: 404,
};

export function createUserHandler(service) {
  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const readBody = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      throw new ValidationError('invalid json');
    }
  };

  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const idMatch = url.pathname.match(/^\\/users\\/([^/]+)$/);

    try {
      if (req.method === 'POST' && url.pathname === '/users') {
        return send(res, 201, await service.register(await readBody(req)));
      }
      if (req.method === 'GET' && url.pathname === '/users') {
        return send(res, 200, await service.list({
          activeOnly: url.searchParams.get('activeOnly') === 'true',
        }));
      }
      if (req.method === 'GET' && idMatch) {
        return send(res, 200, await service.getById(idMatch[1]));
      }
      if (req.method === 'DELETE' && idMatch) {
        return send(res, 200, await service.deactivate(idMatch[1]));
      }
      return send(res, 404, { error: 'not found' });
    } catch (error) {
      const status = STATUS_BY_ERROR[error?.name] ?? 500;
      send(res, status, { error: status === 500 ? 'internal error' : error.message });
    }
  };
}
`,
          tests: `import http from 'node:http';

const build = () => {
  const users = solution.createMemoryUserRepo();
  const service = solution.createUserService({ users });
  return { users, service };
};

describe('the repository', () => {
  it('assigns incrementing string ids', async () => {
    const users = solution.createMemoryUserRepo();
    const a = await users.insert({ email: 'a@x.com' });
    const b = await users.insert({ email: 'b@x.com' });
    expect(a.id).toBe('1');
    expect(b.id).toBe('2');
  });

  it('finds by id and email, and returns null when missing', async () => {
    const users = solution.createMemoryUserRepo();
    await users.insert({ email: 'a@x.com' });
    expect((await users.findById('1')).email).toBe('a@x.com');
    expect(await users.findById('99')).toBe(null);
    expect((await users.findByEmail('a@x.com')).id).toBe('1');
    expect(await users.findByEmail('nope@x.com')).toBe(null);
  });

  it('updates and lists', async () => {
    const users = solution.createMemoryUserRepo();
    await users.insert({ email: 'a@x.com', active: true });
    const updated = await users.update('1', { active: false });
    expect(updated.active).toBe(false);
    expect(updated.email).toBe('a@x.com');
    expect(await users.update('99', { active: false })).toBe(null);
    expect(await users.all()).toHaveLength(1);
  });
});

describe('the service, with no HTTP and no database', () => {
  it('registers a user', async () => {
    const { service } = build();
    const user = await service.register({ email: 'ada@example.com', name: 'Ada' });
    expect(user.id).toBe('1');
    expect(user.email).toBe('ada@example.com');
    expect(user.name).toBe('Ada');
    expect(user.active).toBe(true);
    expect(user.createdAt).toEqual(new Date('2024-01-01'));
  });

  it('normalises the email', async () => {
    const { service } = build();
    const user = await service.register({ email: '  ADA@Example.COM ', name: ' Ada ' });
    expect(user.email).toBe('ada@example.com');
    expect(user.name).toBe('Ada');
  });

  it('rejects an invalid email', async () => {
    const { service } = build();
    for (const email of ['', 'nope', 'a@', '@b.com', null, undefined, 42]) {
      let caught;
      try { await service.register({ email, name: 'x' }); } catch (e) { caught = e; }
      expect(caught).toBeInstanceOf(solution.ValidationError);
    }
  });

  it('rejects a missing name', async () => {
    const { service } = build();
    await expect(service.register({ email: 'a@x.com', name: '  ' }))
      .rejects.toThrow(/name/);
  });

  it('rejects a duplicate email, case-insensitively', async () => {
    const { service } = build();
    await service.register({ email: 'ada@example.com', name: 'Ada' });
    let caught;
    try { await service.register({ email: 'ADA@example.com', name: 'Impostor' }); }
    catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(solution.ConflictError);
  });

  it('gets by id, or throws NotFoundError', async () => {
    const { service } = build();
    await service.register({ email: 'a@x.com', name: 'A' });
    expect((await service.getById('1')).name).toBe('A');
    let caught;
    try { await service.getById('404'); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(solution.NotFoundError);
  });

  it('deactivates, idempotently', async () => {
    const { service } = build();
    await service.register({ email: 'a@x.com', name: 'A' });
    expect((await service.deactivate('1')).active).toBe(false);
    expect((await service.deactivate('1')).active).toBe(false);
    let caught;
    try { await service.deactivate('99'); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(solution.NotFoundError);
  });

  it('lists all or only active', async () => {
    const { service } = build();
    await service.register({ email: 'a@x.com', name: 'A' });
    await service.register({ email: 'b@x.com', name: 'B' });
    await service.deactivate('1');
    expect(await service.list()).toHaveLength(2);
    expect(await service.list({ activeOnly: true })).toHaveLength(1);
    expect((await service.list({ activeOnly: true }))[0].name).toBe('B');
  });

  it('works against a fake repository, proving the dependency is injected', async () => {
    // A stub with no storage at all: the service must not reach past it.
    const calls = [];
    const fake = {
      async insert(data) { calls.push('insert'); return { id: 'stub', ...data }; },
      async findById() { calls.push('findById'); return null; },
      async findByEmail() { calls.push('findByEmail'); return null; },
      async update() { calls.push('update'); return null; },
      async all() { calls.push('all'); return []; },
    };
    const service = solution.createUserService({ users: fake });
    const user = await service.register({ email: 'a@x.com', name: 'A' });
    expect(user.id).toBe('stub');
    expect(calls).toContain('findByEmail');
    expect(calls).toContain('insert');
  });

  it('uses the injected clock', async () => {
    const users = solution.createMemoryUserRepo();
    const service = solution.createUserService({ users, now: () => new Date('1999-12-31') });
    const user = await service.register({ email: 'a@x.com', name: 'A' });
    expect(user.createdAt).toEqual(new Date('1999-12-31'));
  });
});

describe('the handler, mapping errors to statuses', () => {
  const start = async () => {
    const { service } = build();
    const server = http.createServer(solution.createUserHandler(service));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    const base = 'http://127.0.0.1:' + port;
    return {
      post: (path, body) => fetch(base + path, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }),
      get: (path) => fetch(base + path),
      del: (path) => fetch(base + path, { method: 'DELETE' }),
      close: () => new Promise((r) => server.close(r)),
    };
  };

  it('201s a created user', async () => {
    const app = await start();
    try {
      const res = await app.post('/users', { email: 'ada@example.com', name: 'Ada' });
      expect(res.status).toBe(201);
      expect((await res.json()).email).toBe('ada@example.com');
    } finally { await app.close(); }
  });

  it('400s a validation failure', async () => {
    const app = await start();
    try {
      expect((await app.post('/users', { email: 'nope', name: 'x' })).status).toBe(400);
    } finally { await app.close(); }
  });

  it('409s a duplicate', async () => {
    const app = await start();
    try {
      await app.post('/users', { email: 'a@x.com', name: 'A' });
      expect((await app.post('/users', { email: 'a@x.com', name: 'B' })).status).toBe(409);
    } finally { await app.close(); }
  });

  it('404s a missing user', async () => {
    const app = await start();
    try {
      expect((await app.get('/users/99')).status).toBe(404);
    } finally { await app.close(); }
  });

  it('gets, lists and deactivates', async () => {
    const app = await start();
    try {
      await app.post('/users', { email: 'a@x.com', name: 'A' });
      await app.post('/users', { email: 'b@x.com', name: 'B' });

      expect((await (await app.get('/users/1')).json()).name).toBe('A');
      expect(await (await app.get('/users')).json()).toHaveLength(2);

      const deactivated = await app.del('/users/1');
      expect(deactivated.status).toBe(200);
      expect((await deactivated.json()).active).toBe(false);

      expect(await (await app.get('/users?activeOnly=true')).json()).toHaveLength(1);
    } finally { await app.close(); }
  });

  it('404s an unknown route', async () => {
    const app = await start();
    try {
      expect((await app.get('/nope')).status).toBe(404);
    } finally { await app.close(); }
  });
});`,
        },
        {
          id: 'node-crud-boss',
          title: 'BOSS: a service you could deploy',
          kind: 'node',
          xp: 260,
          boss: true,
          why: 'Everything from this track in one API: routing, bodies, validation, auth, errors, pagination. This is the take-home.',
          tags: ['api design', 'auth', 'validation', 'pagination'],
          brief: `The track boss. Build a small notes API with every layer wired together.
No frameworks — \`node:http\` and \`node:crypto\` only.

## Task

Export \`createApi({ token = 'secret-token', now = () => new Date('2024-01-01') } = {})\`
returning \`{ server }\`. The server implements:

| route | behaviour |
| --- | --- |
| \`GET /health\` | \`200\` \`{"status":"ok"}\` — **no auth** |
| \`POST /notes\` | \`201\` the created note |
| \`GET /notes\` | \`200\` \`{ items, total, limit, offset }\` |
| \`GET /notes/:id\` | \`200\` the note, \`404\` if missing |
| \`PATCH /notes/:id\` | \`200\` the updated note |
| \`DELETE /notes/:id\` | \`204\` no body, \`404\` if missing |

**Auth.** Every route except \`/health\` requires
\`Authorization: Bearer <token>\`. Missing or wrong → \`401\`
\`{"error":{"code":"UNAUTHORIZED","message":"authentication required"}}\`.

**A note** is \`{ id, title, body, tags, createdAt, updatedAt }\`. Ids are
sequential strings from \`'1'\`.

**Validation** (→ \`400\`, code \`BAD_REQUEST\`, with a \`details\` object keyed by
field, collecting **all** failures):

- \`title\` — required, string, 1–80 characters after trimming
- \`body\` — optional string, defaults to \`''\`
- \`tags\` — optional array of non-empty strings, defaults to \`[]\`; anything else
  is invalid
- unknown fields are rejected with a message on that field's key

**PATCH** applies only the provided fields, validates them the same way,
requires at least one field, and bumps \`updatedAt\`.

**List** supports \`?limit=\` (1–50, default 10), \`?offset=\` (≥0, default 0) and
\`?tag=\` (exact match). \`total\` is the count **before** paging. Newest first.

Every error uses the envelope \`{"error":{"code","message","details?"}}\`.`,
          starter: `import http from 'node:http';

export function createApi({ token = 'secret-token', now = () => new Date('2024-01-01') } = {}) {
  const notes = new Map();
  let nextId = 1;

  // TODO: build it. Suggested order:
  //   1. send() and the error envelope
  //   2. readJson()
  //   3. validate() for create and patch
  //   4. auth check
  //   5. the router
  const server = http.createServer(async (req, res) => {});

  return { server };
}
`,
          hints: [
            'Start with the plumbing: `send(res, status, body)`, `fail(res, status, code, message, details)`, and `readJson(req)`. Everything else gets shorter.',
            'Write one validator that takes the input and a `partial` flag. For create, a missing title is an error; for patch, a missing title just means "do not change it".',
            'Collect errors into `details` and only throw/respond once, so a client fixing three fields needs one round trip, not three.',
            'Check auth before routing (except `/health`) — one early return keeps it out of every handler.',
            'For 204, call `res.writeHead(204)` and `res.end()` with no body at all. A JSON body with 204 is a protocol violation that some clients choke on.',
            'Sort newest first by comparing `createdAt` descending; with sequential ids, `Number(b.id) - Number(a.id)` is equivalent and cheaper.',
            'Set `updatedAt` to `now()` on create as well as patch — clients rely on it existing.',
          ],
          solution: `import http from 'node:http';

export function createApi({ token = 'secret-token', now = () => new Date('2024-01-01') } = {}) {
  const notes = new Map();
  let nextId = 1;

  const send = (res, status, body) => {
    if (status === 204) {
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const fail = (res, status, code, message, details) =>
    send(res, status, { error: { code, message, ...(details ? { details } : {}) } });

  const readJson = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('not an object');
      }
      return parsed;
    } catch {
      return null;   // signals "invalid body" to the caller
    }
  };

  const ALLOWED = ['title', 'body', 'tags'];

  /** Returns { value } or { details } — never both. */
  const validate = (input, { partial }) => {
    const details = {};
    const value = {};

    for (const key of Object.keys(input)) {
      if (!ALLOWED.includes(key)) details[key] = 'unknown field';
    }

    if ('title' in input) {
      const title = input.title;
      if (typeof title !== 'string') details.title = 'must be a string';
      else if (title.trim().length < 1) details.title = 'must not be empty';
      else if (title.trim().length > 80) details.title = 'must be at most 80 characters';
      else value.title = title.trim();
    } else if (!partial) {
      details.title = 'is required';
    }

    if ('body' in input) {
      if (typeof input.body !== 'string') details.body = 'must be a string';
      else value.body = input.body;
    } else if (!partial) {
      value.body = '';
    }

    if ('tags' in input) {
      const tags = input.tags;
      if (!Array.isArray(tags)) details.tags = 'must be an array of strings';
      else if (tags.some((tag) => typeof tag !== 'string' || !tag.trim())) {
        details.tags = 'must be an array of non-empty strings';
      } else value.tags = tags;
    } else if (!partial) {
      value.tags = [];
    }

    if (partial && Object.keys(value).length === 0 && Object.keys(details).length === 0) {
      details._ = 'at least one field is required';
    }

    return Object.keys(details).length ? { details } : { value };
  };

  const parseListQuery = (searchParams) => {
    const details = {};
    let limit = 10;
    let offset = 0;

    const rawLimit = searchParams.get('limit');
    if (rawLimit !== null) {
      if (!/^\\d+$/.test(rawLimit)) details.limit = 'must be an integer';
      else if (Number(rawLimit) < 1) details.limit = 'must be at least 1';
      else if (Number(rawLimit) > 50) details.limit = 'must be at most 50';
      else limit = Number(rawLimit);
    }

    const rawOffset = searchParams.get('offset');
    if (rawOffset !== null) {
      if (!/^\\d+$/.test(rawOffset)) details.offset = 'must be a non-negative integer';
      else offset = Number(rawOffset);
    }

    return Object.keys(details).length
      ? { details }
      : { value: { limit, offset, tag: searchParams.get('tag') } };
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

    if (pathname === '/health') {
      return req.method === 'GET'
        ? send(res, 200, { status: 'ok' })
        : fail(res, 405, 'METHOD_NOT_ALLOWED', 'method not allowed');
    }

    const authorization = req.headers.authorization ?? '';
    if (authorization !== 'Bearer ' + token) {
      return fail(res, 401, 'UNAUTHORIZED', 'authentication required');
    }

    const idMatch = pathname.match(/^\\/notes\\/([^/]+)$/);

    try {
      if (pathname === '/notes' && req.method === 'POST') {
        const input = await readJson(req);
        if (input === null) return fail(res, 400, 'BAD_REQUEST', 'invalid json');

        const { value, details } = validate(input, { partial: false });
        if (details) return fail(res, 400, 'BAD_REQUEST', 'validation failed', details);

        const timestamp = now();
        const note = {
          id: String(nextId++),
          ...value,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        notes.set(note.id, note);
        return send(res, 201, note);
      }

      if (pathname === '/notes' && req.method === 'GET') {
        const { value, details } = parseListQuery(url.searchParams);
        if (details) return fail(res, 400, 'BAD_REQUEST', 'invalid query', details);

        let all = [...notes.values()].sort((a, b) => Number(b.id) - Number(a.id));
        if (value.tag) all = all.filter((note) => note.tags.includes(value.tag));

        return send(res, 200, {
          items: all.slice(value.offset, value.offset + value.limit),
          total: all.length,           // before paging
          limit: value.limit,
          offset: value.offset,
        });
      }

      if (idMatch) {
        const id = idMatch[1];
        const existing = notes.get(id);

        if (req.method === 'GET') {
          return existing
            ? send(res, 200, existing)
            : fail(res, 404, 'NOT_FOUND', 'note ' + id + ' not found');
        }

        if (req.method === 'PATCH') {
          if (!existing) return fail(res, 404, 'NOT_FOUND', 'note ' + id + ' not found');
          const input = await readJson(req);
          if (input === null) return fail(res, 400, 'BAD_REQUEST', 'invalid json');

          const { value, details } = validate(input, { partial: true });
          if (details) return fail(res, 400, 'BAD_REQUEST', 'validation failed', details);

          const updated = { ...existing, ...value, updatedAt: now() };
          notes.set(id, updated);
          return send(res, 200, updated);
        }

        if (req.method === 'DELETE') {
          if (!existing) return fail(res, 404, 'NOT_FOUND', 'note ' + id + ' not found');
          notes.delete(id);
          return send(res, 204);
        }

        return fail(res, 405, 'METHOD_NOT_ALLOWED', 'method not allowed');
      }

      return fail(res, 404, 'NOT_FOUND', 'not found');
    } catch {
      return fail(res, 500, 'INTERNAL', 'internal server error');
    }
  });

  return { server };
}
`,
          tests: `const TOKEN = 'secret-token';

const start = async (options) => {
  let clock = new Date('2024-01-01T00:00:00Z');
  const api = solution.createApi({ token: TOKEN, now: () => clock, ...options });
  await new Promise((r) => api.server.listen(0, '127.0.0.1', r));
  const { port } = api.server.address();
  const base = 'http://127.0.0.1:' + port;

  const call = (method, path, { body, auth = true, raw } = {}) =>
    fetch(base + path, {
      method,
      headers: {
        ...(auth ? { authorization: 'Bearer ' + TOKEN } : {}),
        ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  return {
    call,
    get: (p, o) => call('GET', p, o),
    post: (p, body, o) => call('POST', p, { body, ...o }),
    patch: (p, body, o) => call('PATCH', p, { body, ...o }),
    del: (p, o) => call('DELETE', p, o),
    advance: (ms) => { clock = new Date(clock.getTime() + ms); },
    close: () => new Promise((r) => api.server.close(r)),
  };
};

const withApi = async (fn) => {
  const app = await start();
  try { await fn(app); } finally { await app.close(); }
};

describe('health and auth', () => {
  it('serves health with no auth', async () => {
    await withApi(async (app) => {
      const res = await app.get('/health', { auth: false });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    });
  });

  it('401s every other route without a token', async () => {
    await withApi(async (app) => {
      for (const [method, path] of [['GET', '/notes'], ['POST', '/notes'], ['GET', '/notes/1'], ['DELETE', '/notes/1']]) {
        const res = await app.call(method, path, { auth: false });
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({
          error: { code: 'UNAUTHORIZED', message: 'authentication required' },
        });
      }
    });
  });

  it('401s a wrong or malformed Authorization header', async () => {
    const api = solution.createApi({ token: TOKEN });
    await new Promise((r) => api.server.listen(0, '127.0.0.1', r));
    const { port } = api.server.address();
    try {
      for (const value of ['Bearer', 'Bearer wrong-token', TOKEN, 'Basic ' + TOKEN, 'bearer ' + TOKEN]) {
        const res = await fetch('http://127.0.0.1:' + port + '/notes', {
          headers: { authorization: value },
        });
        expect(res.status).toBe(401);
      }
      // ...and the correct one still works.
      const good = await fetch('http://127.0.0.1:' + port + '/notes', {
        headers: { authorization: 'Bearer ' + TOKEN },
      });
      expect(good.status).toBe(200);
    } finally {
      await new Promise((r) => api.server.close(r));
    }
  });
});

describe('create', () => {
  it('creates a note with defaults and timestamps', async () => {
    await withApi(async (app) => {
      const res = await app.post('/notes', { title: 'First' });
      expect(res.status).toBe(201);
      const note = await res.json();
      expect(note.id).toBe('1');
      expect(note.title).toBe('First');
      expect(note.body).toBe('');
      expect(note.tags).toEqual([]);
      expect(note.createdAt).toBeTruthy();
      expect(note.updatedAt).toBe(note.createdAt);
    });
  });

  it('trims the title and keeps body and tags', async () => {
    await withApi(async (app) => {
      const note = await (await app.post('/notes', {
        title: '  Spaced  ', body: 'content', tags: ['a', 'b'],
      })).json();
      expect(note.title).toBe('Spaced');
      expect(note.body).toBe('content');
      expect(note.tags).toEqual(['a', 'b']);
    });
  });

  it('assigns sequential ids', async () => {
    await withApi(async (app) => {
      expect((await (await app.post('/notes', { title: 'a' })).json()).id).toBe('1');
      expect((await (await app.post('/notes', { title: 'b' })).json()).id).toBe('2');
      expect((await (await app.post('/notes', { title: 'c' })).json()).id).toBe('3');
    });
  });

  it('400s a missing title', async () => {
    await withApi(async (app) => {
      const res = await app.post('/notes', {});
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.details.title).toBeTruthy();
    });
  });

  it('400s a title that is too long or the wrong type', async () => {
    await withApi(async (app) => {
      expect((await app.post('/notes', { title: 'x'.repeat(81) })).status).toBe(400);
      expect((await app.post('/notes', { title: 42 })).status).toBe(400);
      expect((await app.post('/notes', { title: '   ' })).status).toBe(400);
      expect((await app.post('/notes', { title: 'x'.repeat(80) })).status).toBe(201);
    });
  });

  it('400s bad tags', async () => {
    await withApi(async (app) => {
      expect((await app.post('/notes', { title: 'a', tags: 'not-an-array' })).status).toBe(400);
      expect((await app.post('/notes', { title: 'a', tags: [1, 2] })).status).toBe(400);
      expect((await app.post('/notes', { title: 'a', tags: [''] })).status).toBe(400);
    });
  });

  it('400s unknown fields', async () => {
    await withApi(async (app) => {
      const res = await app.post('/notes', { title: 'a', isAdmin: true });
      expect(res.status).toBe(400);
      expect((await res.json()).error.details.isAdmin).toBeTruthy();
    });
  });

  it('collects every validation failure at once', async () => {
    await withApi(async (app) => {
      const res = await app.post('/notes', { title: 99, tags: 'nope', surprise: 1 });
      expect(res.status).toBe(400);
      const details = (await res.json()).error.details;
      expect(Object.keys(details).sort()).toEqual(['surprise', 'tags', 'title']);
    });
  });

  it('400s invalid JSON', async () => {
    await withApi(async (app) => {
      const res = await app.call('POST', '/notes', { raw: '{not json' });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('BAD_REQUEST');
    });
  });
});

describe('read', () => {
  it('gets one note', async () => {
    await withApi(async (app) => {
      await app.post('/notes', { title: 'Findable' });
      const res = await app.get('/notes/1');
      expect(res.status).toBe(200);
      expect((await res.json()).title).toBe('Findable');
    });
  });

  it('404s a missing note with the envelope', async () => {
    await withApi(async (app) => {
      const res = await app.get('/notes/999');
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe('NOT_FOUND');
    });
  });

  it('lists newest first with pagination metadata', async () => {
    await withApi(async (app) => {
      for (const title of ['a', 'b', 'c']) await app.post('/notes', { title });
      const body = await (await app.get('/notes')).json();
      expect(body.total).toBe(3);
      expect(body.limit).toBe(10);
      expect(body.offset).toBe(0);
      expect(body.items.map((n) => n.title)).toEqual(['c', 'b', 'a']);
    });
  });

  it('pages, and reports the total before paging', async () => {
    await withApi(async (app) => {
      for (let i = 1; i <= 7; i++) await app.post('/notes', { title: 'n' + i });
      const page1 = await (await app.get('/notes?limit=3')).json();
      expect(page1.items).toHaveLength(3);
      expect(page1.total).toBe(7);
      expect(page1.items[0].title).toBe('n7');

      const page3 = await (await app.get('/notes?limit=3&offset=6')).json();
      expect(page3.items).toHaveLength(1);
      expect(page3.total).toBe(7);
      expect(page3.items[0].title).toBe('n1');
    });
  });

  it('filters by tag', async () => {
    await withApi(async (app) => {
      await app.post('/notes', { title: 'tagged', tags: ['work', 'urgent'] });
      await app.post('/notes', { title: 'other', tags: ['home'] });
      const body = await (await app.get('/notes?tag=work')).json();
      expect(body.total).toBe(1);
      expect(body.items[0].title).toBe('tagged');
      expect((await (await app.get('/notes?tag=nothing')).json()).total).toBe(0);
    });
  });

  it('400s bad pagination', async () => {
    await withApi(async (app) => {
      expect((await app.get('/notes?limit=0')).status).toBe(400);
      expect((await app.get('/notes?limit=51')).status).toBe(400);
      expect((await app.get('/notes?limit=abc')).status).toBe(400);
      expect((await app.get('/notes?offset=-1')).status).toBe(400);
    });
  });
});

describe('update', () => {
  it('patches only the given fields and bumps updatedAt', async () => {
    await withApi(async (app) => {
      const created = await (await app.post('/notes', { title: 'Old', body: 'keep', tags: ['x'] })).json();
      app.advance(60_000);

      const res = await app.patch('/notes/1', { title: 'New' });
      expect(res.status).toBe(200);
      const updated = await res.json();
      expect(updated.title).toBe('New');
      expect(updated.body).toBe('keep');
      expect(updated.tags).toEqual(['x']);
      expect(updated.createdAt).toBe(created.createdAt);
      expect(updated.updatedAt).not.toBe(created.updatedAt);
    });
  });

  it('400s an empty patch', async () => {
    await withApi(async (app) => {
      await app.post('/notes', { title: 'a' });
      expect((await app.patch('/notes/1', {})).status).toBe(400);
    });
  });

  it('validates patched fields the same way', async () => {
    await withApi(async (app) => {
      await app.post('/notes', { title: 'a' });
      expect((await app.patch('/notes/1', { title: '' })).status).toBe(400);
      expect((await app.patch('/notes/1', { title: 'x'.repeat(81) })).status).toBe(400);
      expect((await app.patch('/notes/1', { tags: 'nope' })).status).toBe(400);
      expect((await app.patch('/notes/1', { nope: 1 })).status).toBe(400);
    });
  });

  it('404s patching a missing note', async () => {
    await withApi(async (app) => {
      expect((await app.patch('/notes/99', { title: 'x' })).status).toBe(404);
    });
  });
});

describe('delete', () => {
  it('204s with no body, and the note is gone', async () => {
    await withApi(async (app) => {
      await app.post('/notes', { title: 'temp' });
      const res = await app.del('/notes/1');
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      expect((await app.get('/notes/1')).status).toBe(404);
    });
  });

  it('404s deleting twice', async () => {
    await withApi(async (app) => {
      await app.post('/notes', { title: 'temp' });
      expect((await app.del('/notes/1')).status).toBe(204);
      expect((await app.del('/notes/1')).status).toBe(404);
    });
  });

  it('removes it from the list and total', async () => {
    await withApi(async (app) => {
      await app.post('/notes', { title: 'a' });
      await app.post('/notes', { title: 'b' });
      await app.del('/notes/1');
      const body = await (await app.get('/notes')).json();
      expect(body.total).toBe(1);
      expect(body.items).toHaveLength(1);
    });
  });
});

describe('routing edges', () => {
  it('404s unknown paths', async () => {
    await withApi(async (app) => {
      expect((await app.get('/nope')).status).toBe(404);
      expect((await app.get('/notes/1/comments')).status).toBe(404);
    });
  });

  it('survives a burst of bad requests', async () => {
    await withApi(async (app) => {
      await app.call('POST', '/notes', { raw: '{{{' });
      await app.post('/notes', { title: null });
      await app.get('/notes?limit=nope');
      const res = await app.post('/notes', { title: 'still working' });
      expect(res.status).toBe(201);
    });
  });
});`,
        },
      ],
    },
  ],
});
