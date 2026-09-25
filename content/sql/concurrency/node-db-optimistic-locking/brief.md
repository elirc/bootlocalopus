Two people open the same runbook. Ada adds a step and saves; a minute later
Bob, still looking at the old text, fixes a typo and saves. Ada's step is
gone, nobody got an error, and nobody will notice until the next incident.
That is a **lost update**, and "last write wins" is the default behaviour of
every `UPDATE … SET body = $1 WHERE id = $2`.

A row lock does not help here: the two saves are minutes apart, and you cannot
hold a transaction open while someone types. **Optimistic locking** can. Every
row carries a `version`. A writer says which version it read, and the save
only applies if the row is still at that version:

```sql
update documents set body = $1, version = version + 1
 where id = $2 and version = $3
returning …
```

Zero rows back means someone else saved first. The check and the write are
one statement, so nothing can slip in between them — unlike reading the
version, comparing it in JavaScript, and then updating.

The fixture: `documents(id serial, title text, body text, version int default
1, updated_at timestamptz)` with three rows, all at version 1.

## Task

Export these from your module. A document is always the plain object
`{ id, title, body, version }` — exactly those four keys.

1. `getDocument(conn, id)` resolves to the document, or `null` if there is no
   such row.
2. `saveDocument(conn, { id, expectedVersion, title, body })` saves `title`
   and `body` only if the row is still at `expectedVersion`, sets the version
   to one more than it was and `updated_at` to `now()`, and resolves to the
   saved document. When no row is updated, find out why:
   - the row does not exist → throw `DocumentNotFoundError` (with `.id`);
   - it exists at another version → throw `VersionConflictError` with `.id`,
     `.expectedVersion` and `.currentVersion` (the version in the database now).

   `expectedVersion` must be a positive safe integer (so not `0`, `'1'` or
   `1.5`); otherwise throw a `RangeError` before any query.
3. `updateWithRetry(conn, id, mutate, { maxAttempts = 3 } = {})` is how a
   background job edits a document safely: read it, call `mutate(doc)` to get
   `{ title, body }`, and save with the version it read. On a
   `VersionConflictError`, **read again and call `mutate` again** with the
   fresh document — never re-save the old result. Give up after `maxAttempts`
   calls to `mutate` by rethrowing the last `VersionConflictError`. A missing
   document throws `DocumentNotFoundError` without calling `mutate`; an error
   from `mutate` itself propagates at once, with no retry.

The error classes are in the starter; keep their names and fields.

## How it is graded

Through a connection that only has `query(text, params)`. To simulate the
other editor, the grader commits its own save of the same row **just before
your `UPDATE` reaches the database** — after any read you made. Only a version
check inside the `UPDATE` notices it. After a conflict, the other editor's
text must still be in the row.
