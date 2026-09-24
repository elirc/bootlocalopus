The notes search in the starter works for every title anyone tried in QA.
Then a user searches for `O'Brien` and gets a 500. Then someone searches for
`' or 1=1--` and gets **everybody's** notes. Then someone sends
`?sort=title;delete from notes`.

Every one of those is the same bug: user input pasted into SQL **text**. The
fix has two halves, because Postgres can only bind **values**:

- **values** (`q`, the owner id) go in the parameter array: `conn.query(text,
  [ownerId, q])`, referred to as `$1`, `$2`. The database never parses them
  as SQL, whatever they contain;
- **identifiers and keywords** (`order by <column> <dir>`) cannot be
  parameters, so they come from an **allowlist** you control. The user picks a
  key; the SQL you interpolate is yours.

The fixture is `notes(id, owner_id, title, body, created_at)`: six notes for
user 1, two for user 2.

## Task

Rewrite `searchNotes(conn, ownerId, query)` so it is safe. `query` is the
parsed query string: `{ q?, sort?, dir? }`, where each value may be a string,
an **array** of strings (`?sort=a&sort=b`), or `undefined`.

**Results.** Resolve to an array of `{ id, title }` objects (exactly those two
keys) for notes whose `owner_id` is `ownerId`:

- `q` (optional): case-insensitive substring match on `title`, taken
  **literally** — `%` and `_` are ordinary characters, so searching `%`
  finds only titles containing a percent sign. `undefined` or `''` matches
  every note.
- `sort`: `'created_at'` or `'title'`; default `'created_at'`.
- `dir`: `'asc'` or `'desc'` (lower case, exactly); default `'desc'`.
- Break ties by `id` in the **same direction**, so the order is total: two
  notes with the same `created_at` must always come out the same way round.

**Rejections.** Throw (reject with) a `BadRequestError` — the class is in the
starter; the HTTP layer turns it into a `400` — with `field` set to the
offending parameter:

- `sort` present but not exactly one of the allowed strings → `field: 'sort'`.
  That includes `''`, `'id'`, `'title desc'`, an array, and names that
  happen to exist on every JavaScript object, like `'constructor'` and
  `'__proto__'`;
- `dir` present but not exactly `'asc'` or `'desc'` → `field: 'dir'`;
- `q` present but not a string → `field: 'q'`.

Reject **before** touching the database.

**Only through `conn`.** Make exactly **one** `conn.query(text, params)` call
per search. The grader passes a spy as `conn` that exposes only `query` and
records every call.

## How it is graded

A corpus of payloads (`' or 1=1--`, `x'); drop table notes;--`, a `union
select`, `O'Brien`, `%`, `_`) must return the right rows — never another
user's — and leave all eight notes in place. The spy checks that the SQL text
never contains the search string or the owner id, and that the parameters do.
Bad `sort`/`dir`/`q` values must reject with the right `field` and make no
query at all.
