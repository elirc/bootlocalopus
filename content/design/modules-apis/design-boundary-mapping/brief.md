`res.json(row)` is the fastest endpoint anyone ever wrote, and the most
expensive. The response now **is** the database schema: rename a column and
every mobile app breaks; add `mfa_secret` next year and it ships to every
client the same day. The same shortcut on the way in — `db.insert(req.body)`
— lets a client send `"role": "admin"` and have it saved (**mass
assignment**, the bug behind a famous GitHub incident).

The fix is boring and permanent: **a mapping at every boundary**. Rows never
leave the data layer; request bodies never enter it. Each direction is an
explicit **allowlist**, so a new column or a new body field does nothing until
someone decides it should.

## Task

A row looks like this (it will grow more columns):

```js
{ id: 42, email, display_name, password_hash, role, created_at: Date,
  deleted_at, stripe_customer_id }
```

Export `RequestValidationError` (extends `Error`, `name` set to the class
name, with a `fields` object mapping field → message) and:

**`toUserResponse(row, viewer)`** — `viewer` is `{ id, role }` or `undefined`.
Everyone sees `{ id, displayName, createdAt }`, where `id` is a **string** and
`createdAt` is an ISO string (`toISOString()`). A viewer who **is** that user
(ids compared as strings — the row's id is a number, the token's is a string)
or whose `role` is `'admin'` also sees `email` and `role`. Nothing else, ever
— not `password_hash`, not `stripe_customer_id`, not columns added later.
Other viewers' responses must not have an `email` key at all.

**`toUserListResponse(rows, viewer, nextCursor = null)`** —
`{ data: [...mapped with the same rules], nextCursor }`.

**`fromCreateUserRequest(body)`** → `{ email, displayName }` and nothing else,
whatever else the client sent.

- `email`: must be a string; trim and lowercase it; it must then look like
  `something@something.tld` (no spaces).
- `displayName`: must be a string of 1–50 characters **after trimming**;
  return it trimmed.
- Collect **all** problems into one `RequestValidationError` whose `fields`
  has a key per bad field (`email`, `displayName`); the message text is up to
  you.
- A body that is not a plain object (`null`, an array, a string, a number,
  `undefined`) throws `RequestValidationError` with
  `fields: { body: 'must be a JSON object' }`.

**`fromUpdateUserRequest(body)`** → a patch with only the updatable fields
that were sent. The only updatable field is `displayName` (same rule as
above); `email`, `role`, `id` and anything else are ignored. If the patch
would be empty, throw with `fields: { body: 'nothing to update' }`. The
non-object rule applies here too.

## The traps

- `const { password_hash, ...rest } = row` is a **denylist**: it is safe
  today and leaks the next secret column. Build the response from named
  fields.
- `viewer.id === row.id` is `'42' === 42`, which is `false`, so users could
  not see their own email.
- `typeof body === 'object'` is true for `null` and for arrays.
