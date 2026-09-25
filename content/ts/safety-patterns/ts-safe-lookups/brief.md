```ts
const counts: Record<string, number> = {};
for (const word of words) counts[word] = (counts[word] || 0) + 1;
counts['constructor']; // "function Object() { [native code] }1"
```

`Record<string, T>` promises that every string key maps to a `T`. A plain
object used as a dictionary does not keep that promise: it **inherits**
`toString`, `constructor`, `hasOwnProperty` and friends, and `__proto__` is not
a key at all but a setter that replaces the object's prototype. So:

- a lookup table returns a function for the key `"toString"`;
- a word counter produces `"function Object() { [native code] }1"` for the
  word "constructor", and silently drops "__proto__";
- a "get by path" helper given a user-supplied path such as
  `constructor.constructor` walks from your data into `Object` and then
  `Function` — the first step of several template-engine remote code
  execution bugs.

None of this is a type error — `Record<string, T>` is the lie that lets it
compile. The fixes are small: `Object.hasOwn` instead of `in` or a bare
index, and a `Map` (or a null-prototype object) for dynamic keys.

## Task

Export:

- **`lookup(table, key)`** — the value stored under `key` **on the table
  itself**, or `undefined`. Inherited properties (from `Object.prototype` or
  any other prototype) are never returned.
- **`countBy(items, keyOf)`** — any iterable; returns an object mapping each
  key to its count. Every key is an **own** property with its count,
  including `"constructor"`, `"toString"` and `"__proto__"`, and no other keys
  appear in `Object.keys` of the result.
- **`groupBy(items, keyOf)`** — returns a `Map` from key to the items with
  that key, keys in first-seen order, items in input order. Keys are compared
  as the values `keyOf` returns (the number `2` and the string `"2"` are
  different keys).
- **`getPath(value, path)`** — reads a dotted path (`'billing.address.city'`,
  `'lines.1.sku'`), following **own** properties only; array indexes are
  ordinary segments and `length` of an array is its own property. Returns
  `undefined` as soon as a segment is missing or the current value is not an
  object (a primitive or `null`), and returns falsy values such as `0` and
  `null` when they are really there.

The trap in `countBy` is that `counts[key] = …` on a
plain object with `key === '__proto__'` does not create a key at all.
