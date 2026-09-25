`Partial<Config>` makes `server` optional, but if you pass `server` at all you
must pass **all** of it — so the test-override helper that should take
`{ server: { port: 0 } }` demands `host` too, and people reach for `as any`.
The fix is a recursive mapped type. The naive one is three lines and quietly
breaks things:

```ts
type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
```

A function is an `object`, so `onError` becomes `{}` — no longer callable. A
`Date` becomes an object of optional methods, so `{ startedAt: {} }` compiles.
And arrays get mapped element by element, which is wrong for overrides that
**replace** arrays rather than merge them.

## Task

Export three recursive types. All of them:

- leave primitives as they are, and distribute over unions
  (`DeepPartial<X | null>` is `DeepPartial<X> | null`);
- leave **functions and `Date`** completely untouched, wherever they appear.

**`DeepPartial<T>`** — every object property optional, at every depth. Arrays
are **not** recursed into: an array-typed property becomes optional but keeps
its exact array type (`features?: string[]`), because an override replaces the
array whole.

**`DeepReadonly<T>`** — every property `readonly` at every depth, and every
array or tuple becomes a readonly array or tuple of deep-readonly elements:
`{ xs: { id: number }[] }` → `{ readonly xs: readonly { readonly id: number }[] }`,
`[number, { a: string }]` → `readonly [number, { readonly a: string }]`.

**`DeepRequired<T>`** — the opposite of `DeepPartial`: every property required
(`-?`) at every depth. Like `DeepPartial`, arrays are left as they are.

The spec checks exact equality against hand-written types, that nested writes
and `features.push` do not compile on a `DeepReadonly<Config>`, that a
`DeepPartial<Config>` still rejects a typo'd nested key, and that the function
properties stay callable.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
