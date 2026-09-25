The profile page sends `PATCH /users/1 { "displayName": "Ada L." }`, and
the user's bio disappears. The repository's `update` writes every column,
and a field the client did not send arrives as `undefined`, which the
driver sends as `NULL`. The quick fix, `set bio = coalesce($3, bio)`, makes
it impossible to *clear* a bio. And the rest of the app is sprinkled with
`user.display_name` because the repository hands out raw rows.

A repository is the one module that speaks both languages: SQL columns on
one side, the application's objects on the other. Its update is a
**PATCH**:

- a property that is **absent** (or `undefined`) leaves the column alone;
- a property that is **`null`** clears the column — where that is allowed;
- only an explicit **allowlist** of properties may be patched, each mapped
  to a column name you wrote. Nothing from the request ever becomes SQL
  text. (Careful: `'toString' in obj` is true for every object; use
  `Object.hasOwn`.)

So the `SET` list is built at runtime from the properties present, and the
`$n` placeholders must be numbered to match.

The fixture: `users(id serial, email unique not null, display_name not
null, bio, credit_cents not null default 0, created_at, updated_at)`,
with Ada (1), Bob (2, no bio) and Cy (3).

## Task

`createUserRepository(conn)` returns an object with four methods. Every
user it returns is exactly `{ id, email, displayName, bio, creditCents,
createdAt, updatedAt }` (`createdAt`/`updatedAt` are the `Date`s the driver
returns). Every value goes in the parameter array.

1. `findById(id)` → the user, or `null` (not `undefined`) when there is none.
2. `create({ email, displayName, bio })` → the new user (`bio` defaults to
   `null`; the database fills in the rest).
3. `update(id, patch)` → the updated user, or `null` when there is no such
   user.
   - Patchable: `email` → `email`, `displayName` → `display_name`, `bio` →
     `bio`. Values must be strings; `null` is allowed only for `bio`.
   - Any other own key (`creditCents`, `id`, `display_name`, …), a bad
     value, or a `patch` that is not a plain object → `RangeError`, before
     any query.
   - `undefined` values are skipped. If nothing is left, resolve to
     `findById(id)` without running an `UPDATE`.
   - Otherwise **one** `UPDATE` that sets only those columns plus
     `updated_at = now()`, and `returning` the row.
4. `remove(id)` → `true` if a user was deleted, `false` if there was none.

All four throw a `RangeError` before any query unless `id` is a positive
safe integer (ids often arrive as strings from URLs: convert them in the
route, not here).

## How it is graded

Through a connection that only has `query`, recording each call. The
grader checks the mapping with `toStrictEqual`, that patches of every
combination of fields change exactly those columns (and bump `updatedAt`),
that `null` clears the bio, that an empty patch runs no `UPDATE`, that each
update is one statement with its values as parameters, and that forbidden
keys — including `constructor`, `toString`, and a key that looks like SQL —
are refused without a query.
