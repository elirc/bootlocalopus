A client wants to change one field of a profile, so it sends
`PATCH /profiles/7` with `{ "settings": { "theme": "dark" } }`. The server does
`Object.assign(profile, body)` and three bugs ship at once:

- **Nested objects are replaced, not merged.** `settings` used to hold
  `theme` *and* `language`; now it only holds `theme`. The user's language
  setting is gone.
- **There is no way to remove a field.** `{ "nickname": null }` stores a
  literal `null` instead of clearing it.
- **The stored object is mutated before it is validated.** A patch that fails
  validation has already changed the record that every other request reads.

**JSON Merge Patch** ([RFC 7396](https://www.rfc-editor.org/rfc/rfc7396),
content type `application/merge-patch+json`) is the standard, boring answer:

- a patch **object** is merged into the target key by key, recursively;
- a `null` value **deletes** that key;
- anything that is not an object — a string, a number, an **array** — simply
  **replaces** the target value. Arrays are never merged element by element.

```
target  { "a": 1, "s": { "x": 1, "y": 2 }, "tags": ["a", "b"] }
patch   { "a": null, "s": { "y": 3, "z": { "k": null, "v": 1 } }, "tags": ["c"] }
result  { "s": { "x": 1, "y": 3, "z": { "v": 1 } }, "tags": ["c"] }
```

Note the `z` in that example: it did not exist in the target, so it is merged
into an empty object — which means the `null` inside it disappears rather than
being stored.

## Task

### 1. `applyMergePatch(target, patch)`

Return the result of applying `patch` to `target`, following the three rules
above. If `patch` itself is not a plain object (a primitive, `null` or an
array), the result is `patch`. If `target` is not a plain object but `patch`
is, merge into `{}`.

**Never mutate** `target` or `patch`, and do not return an object that shares
a nested object with `target` that you changed. (Sharing untouched nested
values is fine.)

### 2. `createPatchHandler({ load, save, readonly = [], validate = () => null })`

Return a Node `(req, res)` handler for `PATCH /<anything>/<id>` — the id is the
last path segment of `req.url` (ignore any query string).

- `load(id)` returns (or resolves to) the stored object, or `undefined`.
- `save(id, next)` stores the new object (may be async).
- `readonly` — top-level field names a patch may not contain at all.
- `validate(next)` returns `null` when the result is valid, or an object of
  field → message.

In this order:

1. `content-type` is not `application/merge-patch+json` (parameters such as
   `; charset=utf-8` are allowed, case-insensitive) → **415**
   `UNSUPPORTED_MEDIA_TYPE`.
2. Body is not valid JSON → **400** `INVALID_JSON`. Body is valid JSON but not
   a plain object → **400** `INVALID_PATCH` (replacing a whole resource with
   `[]` or `"x"` is not a patch this API accepts).
3. Nothing stored under the id → **404** `NOT_FOUND`.
4. The patch contains any `readonly` key (even with the same value, even
   `null`) → **422** `READONLY_FIELD`, `details: { fields: [...] }` listing
   them in patch order.
5. Apply the patch. `validate(next)` returns errors → **422**
   `VALIDATION_FAILED` with those errors as `details`.
6. `await save(id, next)` → **200** `{ "data": next }`.

On every error, `save` is not called and the stored object is untouched.
Responses are JSON (`content-type: application/json`); errors use
`{ "error": { "code", "message", "details"? } }` (message wording is yours).
