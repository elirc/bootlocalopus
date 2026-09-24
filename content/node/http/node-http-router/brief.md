`node:http` gives you a request and a response. Everything else —
routing, params, JSON, status codes — is code someone wrote. Write it once.

## Task

Export `createServer()` returning a `http.Server` that handles:

| request | response |
| --- | --- |
| `GET /health` | `200` `{"status":"ok"}` |
| `GET /users` | `200` a JSON array of the two seeded users |
| `GET /users/:id` | `200` that user, or `404` `{"error":"not found"}` |
| any other method on `/health`, `/users` or `/users/:id` | `405` with an `Allow: GET` header |
| any path not listed above | `404` `{"error":"not found"}` |

The general rule: a **path** that exists with the wrong **method** is a `405`
(e.g. `POST /users`, `DELETE /health`), not a `404`. A `404` means the path
itself is unknown.

Seed data: `[{ id: '1', name: 'ada' }, { id: '2', name: 'bob' }]`.

Every response must set `content-type: application/json`. Query strings must
not break routing — `/health?verbose=1` still works.