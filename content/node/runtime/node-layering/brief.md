The reason a codebase becomes untestable is business logic married to
`req`/`res` and to the database driver. Three layers fix it:

- **repository** — data access only, no rules
- **service** — the rules, taking the repository as a dependency
- **handler** — HTTP only: read the request, call the service, choose a status

The service is where the value is, and it becomes testable with a fake
repository and no server at all.

## Task

Export:

- `createUserService({ users, now = () => new Date('2024-01-01') })` returning
  `{ register, getById, deactivate, list }`

  - `register({ email, name })` — lowercases and trims the email, rejects an
    invalid one (`ValidationError`), rejects a duplicate (`ConflictError`),
    and stores `{ email, name, active: true, createdAt: now() }`
  - `getById(id)` — the user, or throws `NotFoundError`
  - `deactivate(id)` — sets `active: false`, returns the updated user, throws
    `NotFoundError` if missing, and is **idempotent**
  - `list({ activeOnly })` — all users, or only active ones

- `createMemoryUserRepo()` — `{ insert, findById, findByEmail, update, all }`
  with auto-incrementing string ids starting at `'1'`
- `ValidationError`, `ConflictError`, `NotFoundError`
- `createUserHandler(service)` — `(req, res)` mapping
  `POST /users` → 201, `GET /users/:id` → 200,
  `DELETE /users/:id` → 200, `GET /users` → 200, with
  `ValidationError` → 400, `ConflictError` → 409, `NotFoundError` → 404