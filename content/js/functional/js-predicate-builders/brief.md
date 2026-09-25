Every list screen grows a filter like this:

```js
rows.filter((r) =>
  (!filters.status || r.status === filters.status) &&
  (!filters.q || r.name.toLowerCase().includes(filters.q.toLowerCase()) ||
     r.email?.toLowerCase().includes(filters.q.toLowerCase())) &&
  (!filters.minTotal || r.total >= Number(filters.minTotal)));
```

Each new filter edits the one big lambda, none of the pieces can be tested
alone, and it already has two bugs: a row whose `name` is `null` throws, and
a search for `'ada '` (a trailing space from a paste) matches nothing.

This is where small curried functions **earn their keep**: `propEq('status')`
is "a check on status, value to follow", `gte(100)` is "at least 100", and
you assemble a predicate from parts, the same way a query builder does.

## Task

Every builder returns a **predicate**: a function of one item returning a
boolean. Paths are property names or dotted paths (`'owner.name'`); a missing
link in a path reads as `undefined` and never throws.

- `prop(path)` — returns `(item) => value at path`.
- `propEq(path, value)` — predicate: value at path `=== value`.
  **Curried:** `propEq(path)` with one argument returns `(value) => predicate`,
  so `['open', 'paid'].map(propEq('status'))` works. Calling it with an
  explicit `undefined` (`propEq('deletedAt', undefined)`) is the two-argument
  form: count the arguments, do not test for `undefined`.
- `gte(n)` / `lte(n)` — `(value) => boolean`, true for a number (not `NaN`)
  that is `>= n` / `<= n`. Anything else, including `null`, is `false`.
- `includesText(query)` — `(value) => boolean`: case-insensitive substring
  match of the trimmed query in a string. A non-string value is `false`. An
  empty or whitespace-only query matches **everything** (a cleared search box
  filters nothing).
- `where(spec)` — predicate over an item: for each key of `spec` (a path), if
  the spec value is a function it is called with the value at that path and
  must return truthy; otherwise the value at the path must be `===` to it.
  `where({})` matches everything.
- `allOf(...preds)`, `anyOf(...preds)`, `not(pred)` — combinators.
  `allOf()` is always `true`, `anyOf()` always `false`.
- `fromQuery(query)` — builds the list filter from URL query values (all
  strings, or missing):
  - `status`: a comma-separated list, e.g. `'open,paid'`; the item's
    `status` must be one of them.
  - `q`: `includesText` against `name` **or** `email`.
  - `minTotal` / `maxTotal`: numeric bounds on `total` (inclusive). Ignore
    one that is not a finite number. Note `Number('')` is `0`, not `NaN`.
  - `owner`: `owner.name` must equal it.
  - A key that is missing or `''` adds no condition; unknown keys are ignored.
