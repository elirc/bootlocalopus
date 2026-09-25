A user signs up with an email that is already registered and gets a 500
with `duplicate key value violates unique constraint
"users_email_lower_key"` in the logs. The fix most teams reach for is a
`SELECT` first: "is this email taken?". It makes the common case friendlier
and the rare case no better: two sign-ups in the same second both pass the
check, and one still hits the constraint. **The constraint is the only
check that holds under concurrency.** So let the database decide, and
translate its answer.

Every database error carries what you need:

- `err.code` — the SQLSTATE: `23505` unique violation, `23503` foreign
  key violation, `23514` check violation, and many more;
- `err.constraint` — the **name** of the constraint that fired. Names are
  part of the schema you wrote; the **message** text is not yours and
  changes with the server's version and language, so never parse it.

Map the known `(code, constraint)` pairs to errors the rest of the app
understands — an HTTP layer turns `ConflictError` into 409,
`NotFoundError` into 404 or 422, `ValidationError` into 400 — and let
everything else through untouched, so real failures still page someone.

The fixture: `teams(id, slug)` (`teams_slug_key`); `users(id, email,
username, age)` with `users_username_key`, `users_age_check` (age ≥ 13)
and a case-insensitive unique index `users_email_lower_key` on
`lower(email)`; `memberships(team_id, user_id, role)` with
`memberships_pkey`, `memberships_team_id_fkey`, `memberships_user_id_fkey`
and `memberships_role_check`. The error classes are in the starter.

## Task

1. `translateDbError(err)` returns, for exactly these pairs, a new error
   whose `.cause` is `err`:

   | code | constraint | returns |
   | --- | --- | --- |
   | `23505` | `users_email_lower_key` | `ConflictError('email')` |
   | `23505` | `users_username_key` | `ConflictError('username')` |
   | `23505` | `teams_slug_key` | `ConflictError('slug')` |
   | `23505` | `memberships_pkey` | `ConflictError('membership')` |
   | `23503` | `memberships_team_id_fkey` | `NotFoundError('team')` |
   | `23503` | `memberships_user_id_fkey` | `NotFoundError('user')` |
   | `23514` | `users_age_check` | `ValidationError('age')` |
   | `23514` | `memberships_role_check` | `ValidationError('role')` |

   For anything else — another code, another constraint (even one called
   `constructor`), an error that is not from the database — it returns
   `err` itself.
2. `registerUser(conn, { email, username, age })` inserts the user and
   resolves to its id; `addMember(conn, { teamId, userId, role })` inserts
   the membership. Both throw `translateDbError(err)` for any error. Drop
   the starter's pre-check, or keep it for a friendlier fast path — but the
   insert's own failure must be translated too.

## How it is graded

`translateDbError` is called directly with error objects shaped like the
driver's (`code`, `constraint`, `message`), including one whose message
names a different constraint than its `constraint` field. The services run
against the database: duplicate email in another case, duplicate username,
under-age, missing team, missing user, repeated membership, bad role. One
test registers a conflicting user **just before your `INSERT`** runs, after
any check you make, and expects `ConflictError('email')` with the database
error as `.cause`. A connection failure must come out unchanged.
