A conditional type is a type-level `if`: `T extends U ? X : Y`. Combined
with key remapping it lets you filter an object's keys by their *value* type.

## Task

Export:

- `FunctionKeys<T>` — a union of the keys whose values are functions
- `DataKeys<T>` — the keys whose values are **not** functions
- `Methods<T>` — the object with only the function-valued properties
- `NonNullableProps<T>` — every property with null and undefined removed from
  its type (the property stays required)
- `Flatten<T>` — removes one level of *nesting*: `string[][]` becomes
  `string[]`, while an already-flat `number[]` and a non-array are returned
  unchanged
- `Unionise<T>` — an object type to a union of `{ key, value }` pairs

One trap is deliberate: a conditional type over a bare type parameter
distributes over unions, and `boolean` is a union (`true | false`). If a
result comes back looking like nonsense, that is why.