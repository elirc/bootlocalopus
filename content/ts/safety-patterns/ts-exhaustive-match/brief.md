```ts
function price(plan: Plan): number {
  switch (plan.kind) {
    case 'free': return 0;
    case 'pro': return plan.seats * 12;
  }
  return 0; // someone added 'enterprise' last week; it is now free
}
```

A `switch` with a fallback `return` compiles forever: the day someone adds a
variant, every such `switch` quietly routes it to the default. The
`assertNever` default you have already seen fixes that for statements. This
lesson packages exhaustiveness into an **expression**, the way `ts-pattern`
and similar libraries do, so a new variant is a compile error at every call
site that does not handle it:

```ts
const monthly = match(plan, {
  free: () => 0,
  pro: (p) => p.seats * 12,          // p is narrowed to the 'pro' variant
  enterprise: (p) => p.negotiated,
});
```

Traps:

1. **Inferring the result.** `match<T, R>(value: T, handlers: Handlers<T, R>): R`
   looks right, but `R` comes out as `unknown`: TypeScript fixes it before it
   has checked the handler functions. Make the whole handlers object a type
   parameter (`H extends Handlers<T, unknown>`) and compute the result from `H`
   — which also gives you the *union* when handlers return different types.
2. **Extra handlers.** A constraint does not trigger the excess-property check
   an annotation does, so `hexagon: () => 4` slips through `H extends …`.
   Intersect the parameter with a type that maps every key that is not a kind
   to `never`.
3. **Fallbacks that see too much.** A partial match with a fallback should
   give the fallback only the variants that were **not** handled.

## Task

Every union here is discriminated by a string `kind`. Export:

- **`Handlers<T, R>`** — an object with exactly one key per `kind` of `T`,
  each a function from *that* variant to `R`.
- **`match(value, handlers)`** — calls the handler for `value.kind`. Missing
  handlers, handlers for kinds that do not exist and handlers that misuse
  their variant are compile errors. The result type is the union of the
  handlers' return types. `value` must have a string `kind`.
- **`matchOr(value, handlers, otherwise)`** — `handlers` covers **some**
  kinds (none is fine, unknown kinds are errors); `otherwise` receives the
  value typed as **only the unhandled variants**. Use an own-property check
  to decide which one runs.
- **`isKind(kind)`** — returns a type predicate usable directly in
  `shapes.filter(isKind('circle'))`, which is then `Circle[]`.

Dispatching `handlers[value.kind](value)` needs a cast: TypeScript cannot
relate the handler it looked up to the variant it holds. One assertion in each
function is expected.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
