```ts
const machine = createMachine({ states: ['idle', 'loading'], initial: 'idel' });
```

That compiles. TypeScript infers a type parameter from **every** position it
appears in, so `S` is inferred from the `states` array *and* from `initial`,
and the typo simply joins the union: `S = 'idle' | 'loading' | 'idel'`. The
function that was meant to validate `initial` has quietly accepted it.

The same thing happens to every "value plus fallback" API:

```ts
declare const role: 'admin' | 'member' | undefined;
withDefault(role, 'guest');            // T = 'admin' | 'member' | 'guest'  — no error
retry(loadUser, { onGiveUp: () => null }); // Promise<User | null> — callers now null-check forever
```

The fix is to decide **which argument is the source of truth** and stop the
others from voting. `NoInfer<T>` (TypeScript 5.4+) marks a position as
"check against `T`, but do not infer `T` from here". The older trick is a
second type parameter constrained by the first (`<T, F extends T>(…, fallback: F)`),
which also works.

## Task

Export these three functions, with the runtime behaviour described and the
types the spec checks:

**`createMachine(config)`**

- `config` is `{ states: readonly S[]; initial: S }` where `S extends string`.
  The **states array** is the source of truth for `S`.
- Returns `Machine<S>`; export the interface too:
  `{ readonly states: readonly S[]; readonly current: S; go(next: S): void }`.
  `current` starts as `initial`; `go` changes it. `current` must reflect the
  latest `go` (a getter, or a plain property you update).
- Spec: `initial: 'idel'` is an error; `machine.current` is
  `'idle' | 'loading'`; `machine.go('done')` is an error.

**`withDefault(value, fallback)`**

- `value: T | undefined`, returns `value` unless it is `undefined`, otherwise
  `fallback`. The **value** decides `T`.
- Spec: with `role: 'admin' | 'member' | undefined`, `withDefault(role, 'guest')`
  is an error and `withDefault(role, 'member')` returns `'admin' | 'member'`;
  `withDefault(tags, [])` with `tags: string[] | undefined` returns `string[]`.

**`retry(fn, options)`**

- `fn: () => Promise<T>`; `options: { attempts: number; onGiveUp: (lastError: unknown) => T }`.
- Calls `fn` up to `attempts` times; resolves with the first success. If every
  attempt rejects, resolves with `onGiveUp(lastError)`.
- The return type is `Promise<T>` where **`fn`** decides `T`: `onGiveUp: () => null`
  against a `Promise<User>` loader is an error, while a caller who really wants
  `null` says so explicitly with `retry<User | null>(…)`.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
