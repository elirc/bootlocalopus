Every "sync" feature is a diff: the server's product list against the one in
the store, today's CSV import against yesterday's, the rows a form started with
against the rows it is saving. The version in most codebases is

```js
const added = next.filter((n) => !prev.find((p) => p.id === n.id));
```

which is O(n·m). At 500 rows nobody notices; at 50 000 rows the tab freezes for
half a minute. The other two classic bugs are quieter:

- **Keying a plain object by id.** `seen[record.id] = true` turns every key into
  a string, so the product with id `1` and the one with id `"1"` become the same
  record. A `Map` compares keys with SameValueZero: `1` and `"1"` stay apart.
- **Comparing with `JSON.stringify`.** `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }`
  are the same record but different strings, so every row whose keys came back
  in a different order is reported as "changed". And `NaN` stringifies to
  `null`, so a real change goes unreported.

## Task

Export `diffById(prev, next, options?)`. `prev` and `next` are arrays of
records; `options` is `{ key, equals }`, both optional:

- `key` — a property name (default `'id'`) or a function `record => key`.
- `equals(before, after)` — decides whether a record present on both sides
  changed. The default is a **shallow** comparison: the two records have the
  same set of own enumerable keys (order does not matter), and every value is
  equal by `Object.is`. `{ a: undefined }` and `{}` are therefore different.

Return `{ added, removed, changed }`:

| field | contents | order |
| --- | --- | --- |
| `added` | records of `next` whose key is not in `prev` | `next` order |
| `removed` | records of `prev` whose key is not in `next` | `prev` order |
| `changed` | `{ before, after }` for keys on both sides where `equals` is false | `next` order |

Rules the grader checks:

- Keys are compared with SameValueZero (the way a `Map` compares them): `1` and
  `"1"` are different keys.
- A key that appears **twice in the same array** is a data bug: throw an
  `Error` whose message contains the word `duplicate` and the key.
- Return the original record objects (not copies), and do not mutate either
  input.
- It must be linear: the grader diffs two lists of 100 000 records.
