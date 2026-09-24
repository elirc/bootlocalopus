`const user = await res.json() as User` is a lie you tell the compiler.
Zod exists because you need a runtime check that also produces a type.

This lesson has **runtime** tests: build the checker and make it work.

## Task

Export a tiny schema library:

- `string()`, `number()`, `boolean()` — leaf validators
- `optional(schema)` — accepts `undefined` too
- `arrayOf(schema)`
- `object(shape)` — an object of validators
- every validator is `{ parse(value, path?) }`: returns the value on success,
  throws `ValidationError` (exported) on failure

`ValidationError` carries `.path` — a dotted string like `'user.tags.1'` —
and a message ````expected number at user.age, got string````. Object
validators must reject extra keys, and report the **first** failure they hit in
declaration order.

The input is untrusted, so "extra key" means *any* own key the shape does not
declare — including `constructor`, `toString` and `__proto__` (which
`JSON.parse` happily creates as an own key). `key in shape` walks the
prototype and would let those through; so would reading `value[key]` for a key
the payload does not own. Use `Object.hasOwn`.