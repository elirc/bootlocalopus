Two support agents edit the same order at the same time. The second save
silently overwrites the first, and a customer receives the wrong items. A
week later a security researcher reports that `GET /orders/123` answers
`403` for orders that exist and `404` for ones that don't, so anyone can
count your orders. Neither bug was caught, because every test in the suite
logged in as the order's owner and made one request.

The bugs that matter in an API with users are about **who** is asking and
**in what order** things happen. This boss is the suite that catches them:
several users, request sequences, and conditional writes.

## The API under test

`createApp({ users })` returns an unstarted `http.Server`. `users` maps a
bearer token to `{ id, role }`, where `role` is `'customer'` or `'admin'`.
Every request needs `Authorization: Bearer <token>`. An unknown or missing
token is `401` `UNAUTHORIZED`.

An order is `{ id, owner, status, items, version }`. `status` is `'open'`
or `'cancelled'`, and `items` is a non-empty array of `{ sku, qty }`.
Responses that return one order carry an **`ETag`** for its current version.
Treat the ETag's value as opaque.

| request | contract |
| --- | --- |
| `POST /orders` `{ items }` | `201` the new order (owner = caller, `open`) with its `ETag`; bad items → `400` `VALIDATION` |
| `GET /orders` | `200` `{ items }`: a customer sees **only their own** orders; an admin sees all |
| `GET /orders/:id` | `200` with `ETag`. **Another customer's order is `404` `NOT_FOUND`**, exactly like a missing one. Admins can read any order |
| `PATCH /orders/:id` `{ items }` | needs **`If-Match`** with the current ETag. No `If-Match` → `428` `PRECONDITION_REQUIRED`. A stale one → `412` `PRECONDITION_FAILED`, and nothing changes. A cancelled order → `409` `CONFLICT`. Success → `200` and a **new** ETag |
| `POST /orders/:id/cancel` | `open` → `cancelled` (`200`, new ETag); already cancelled → `409` `CONFLICT` |
| `DELETE /orders/:id` | admins only: `204`. The owner gets **`403` `FORBIDDEN`**: they can see the order, but they can't delete it |

The same visibility rule applies to PATCH, cancel and DELETE: an order
the caller can't see is `404`.

## Your task

Write a test file that uses `describe` / `it` / `expect` and `fetch` against
the global `solution` (also available as `subject`). The starter's
`withApp` starts a fresh server with three users (`alice`, `bob`, `admin`),
and **closes it in a `finally`**.

- Write **at least 10 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same**, with a
  different ETag format, reworded messages and reordered JSON keys. Read
  ETags from responses, and assert on status, `error.code` and field
  values.
- Nine planted bugs must each make at least one of your tests fail.

## The trap

Most of these bugs are invisible to a single user. For each rule, ask who
else could make the request (the other customer, the admin, the owner
doing something only an admin may do), and write that test. For
concurrency, play both writers: fetch the ETag, let "writer A" PATCH with
it, then let "writer B" PATCH with the **same old** ETag. B must get `412`,
and A's change must survive.
