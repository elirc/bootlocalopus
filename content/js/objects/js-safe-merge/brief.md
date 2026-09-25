The config loader deep-merges defaults, a file and a JSON request body. Then
someone posts this:

```json
{ "__proto__": { "isAdmin": true } }
```

`JSON.parse` makes `__proto__` an ordinary **own** key. A naive recursive
merge reads `target["__proto__"]` — which is `Object.prototype` — and merges
`isAdmin: true` into it. Now **every object in the process** has
`isAdmin === true`. This is prototype pollution, and it has shipped in
lodash, jQuery and dozens of config libraries.

## Task

Export two functions.

### `isPlainObject(value)`

`true` only for objects whose prototype is `Object.prototype` or `null`
(`{}`, object literals, `JSON.parse` output, `Object.create(null)`).
`false` for `null`, primitives, arrays, functions, `Date`, `Map`, and class
instances.

### `deepMerge(...sources)`

Returns a **new** object; never mutates any argument.

- Sources are applied left to right; a later value wins.
- Only a source's **own enumerable string keys** are copied (`Object.keys`) —
  inherited properties are not.
- The keys `__proto__`, `constructor` and `prototype` are **skipped at every
  depth**.
- When the value already in the result and the incoming value are **both
  plain objects**, they are merged recursively. In every other case the
  incoming value replaces the old one: arrays are replaced (not concatenated),
  and a `Date`, `Map` or class instance is kept as-is (the same reference),
  never converted into a plain object.
- An incoming `undefined` is skipped (it does not erase an earlier value);
  `null` does overwrite.
- A source that is not a plain object (`undefined`, `null`, …) is ignored.
- Every plain object in the result is a **fresh** object, even when only one
  source had it — mutating `result.db.pool` must never reach back into a
  source.
- `deepMerge()` returns `{}`, and the result's prototype is
  `Object.prototype`.

The trap: checking `key !== '__proto__'` only at the top level. The payload
can hide the key one level down, or go through
`constructor.prototype` instead.
