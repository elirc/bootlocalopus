`structuredClone` copies a `Date`, a `Map`, a `Set`, a `BigInt` and
`undefined` faithfully, but only inside one process. The moment data crosses
a boundary as JSON (an API response, a queue message, `localStorage`, a
server-rendered page's props), `JSON.stringify` quietly degrades it:

| value | after a JSON round trip |
| --- | --- |
| `new Date(…)` | a string, so `order.placedAt.getTime()` throws |
| `new Map([[1, 'a']])` | `{}` |
| `new Set(['x'])` | `{}` |
| `{ note: undefined }` | `{}` (the key is gone) |
| `[1, undefined]` | `[1, null]` |
| `NaN`, `Infinity` | `null` |
| `10n` | throws `TypeError: Do not know how to serialize a BigInt` |

Libraries like superjson and devalue fix this by encoding such values as
**tagged** JSON objects. You are writing that codec, and there are three
traps in the obvious approach:

1. A `replacer` passed to `JSON.stringify` receives a `Date` **after** its
   `toJSON()` has run, so `value instanceof Date` is never true there (the
   original is still on `this[key]`).
2. A `reviver` passed to `JSON.parse` that returns `undefined` **deletes** the
   key, so it can never restore an `undefined`.
3. Tagged objects are ordinary JSON objects. If a user's data happens to look
   like a tag (a form field called `$type`), a naive decoder turns their
   object into a `Date`. Any object that could be mistaken for a tag must be
   **escaped** on the way out.

## Task

Export `encode(value)` returning a JSON string, and `decode(text)` returning
the value. `decode(encode(x))` must give back an equal value for:

- everything JSON supports (objects, arrays, strings, finite numbers,
  booleans, `null`), at any depth and in any combination with the below;
- `Date`, including an Invalid Date (`new Date(NaN)`);
- `Map` (keys of any type, including numbers and objects, in order) and `Set`;
- `BigInt`;
- `NaN`, `Infinity`, `-Infinity`;
- `undefined` as a property value (the key must still exist), as an array
  element, and as the whole value;
- plain objects whose keys look like your tags, which must come back as the
  same plain objects.

Also:

- The output of `encode` is valid JSON (`JSON.parse` accepts it).
- Data that contains none of the special values above and no key starting
  with `$` encodes **exactly** as `JSON.stringify` would, so plain payloads
  stay readable and compatible. Likewise `decode` of JSON that another system
  produced (without any `$` keys) equals `JSON.parse` of it.
- Any other object with a `toJSON()` method is encoded as its `toJSON()`
  result, as `JSON.stringify` does.
- `decode('{"__proto__": {"admin": true}}')` gives an object with an **own**
  `__proto__` key and an ordinary prototype, as `JSON.parse` does: build
  objects in a way that cannot set a prototype.

You choose the tag format, as long as it marks tags with a key that starts
with `$` (that follows from the "encodes exactly as `JSON.stringify`" rule).
For example `{ "$type": "Date", "value": "2024-03-10T12:30:00.000Z" }`.
