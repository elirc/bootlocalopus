The chapter boss: an attachments service — the feature where every input
boundary from this chapter meets in one request. The body, its declared type,
its file name, its size and the user sending it are all attacker-controlled,
and the file you store is served back to other browsers from your origin.

`node:http` and `node:crypto` only; no imports from earlier lessons (copy
what you need).

## Task

Export `createAttachmentsApp({ authenticate, maxBytes = 5_242_880, quotaBytes = 20_971_520, maxInFlight = 2 })`
returning `{ server }` (an `http.Server`, not listening). `authenticate(req)`
returns (or resolves) a user id string, or `null`.

Errors are JSON `{ "error": "<code>" }` with `content-type: application/json`.
Paths other than `/attachments` and `/attachments/<id>` (`<id>` matching
`[A-Za-z0-9_-]+`) → `404 not-found`, checked before authentication. On those
two paths, no user → `401 unauthorized`; a method not listed below → `404`.

### `POST /attachments` — upload

The raw file is the body. Check in this order:

1. No `content-length` header (e.g. a chunked upload) → `411 length-required`.
2. `content-length > maxBytes` → `413 too-large`, **without reading the body**.
3. The `x-filename` header is the percent-encoded UTF-8 file name (missing →
   `''`); if `decodeURIComponent` throws → `400 bad-request`.
4. The user already has `maxInFlight` uploads in progress → `429 too-many-in-flight`.
5. `stored + reserved + content-length > quotaBytes` → `413 quota-exceeded`.
   `stored` is the size of the user's current files; `reserved` is the
   `content-length` of their uploads still in progress.
6. Reserve the slot and the bytes, read the body, and validate it like the
   upload lesson — with only three formats (PNG, JPEG, PDF — same magic bytes
   and extensions): empty body → `400 empty`; `unsupported-type`,
   `type-mismatch` (against the `content-type` header, same normalisation and
   "unknown" rule) or `extension-mismatch` → `415` with that code. The display
   name is cleaned exactly as before (last segment, no control characters,
   trimmed, `'file'` if empty).
7. Store it under a new random id (16 random bytes, base64url) and answer
   `201 { id, name, type, size }` — `name` is the display name, `type` the
   sniffed type.

The slot and the reservation are released exactly once however the upload
ends — stored, rejected, or the client disconnecting halfway.

### `GET /attachments` → `200` the caller's files as `[{ id, name, type, size }]`, oldest first.

### `GET /attachments/<id>` — download

Someone else's file, or an unknown id → `404 not-found` (not 403: do not
confirm it exists). Otherwise `200` with the bytes and:

- `content-type`: the sniffed type; `content-length`;
- `content-disposition`: built exactly like the Content-Disposition lesson
  (always `attachment`);
- `x-content-type-options: nosniff`;
- `content-security-policy: default-src 'none'; sandbox`.

### `DELETE /attachments/<id>` → `204` (own file only, else `404`); its bytes stop counting towards the quota.
