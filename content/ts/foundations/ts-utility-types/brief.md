`Pick`, `Omit`, `Partial` and friends are ordinary TypeScript, about one
line each. Writing them is the fastest way to learn mapped types.

## Task

Define and export these type aliases **without** using the built-in versions:

- `MyPartial<T>` — every property optional
- `MyRequired<T>` — every property required (strip `?`)
- `MyReadonly<T>` — every property readonly
- `MyPick<T, K extends keyof T>`
- `MyOmit<T, K extends keyof T>`
- `MyRecord<K extends keyof any, V>`
- `DeepReadonly<T>` — recursive, and it must leave functions and primitives
  alone while still recursing into arrays