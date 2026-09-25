```ts
function toDate(input: string | null): Date | null { … }
const created = toDate(row.created_at); // row.created_at is a string
created.getTime();                      // error: 'created' is possibly null
```

The signature is honest and useless: a caller who *knows* they passed a string
still has to null-check the result. The return type should follow from the
argument. There are two tools for that, and picking the wrong one hurts:

- **Overloads** list discrete input → output cases. Use them when the mapping
  is a small table: `string → Date`, `null → null`.
- **Generics** express a *relationship*: the output contains or is looked up
  from the input type (`K → Settings[K]`). Writing one overload per key does
  not scale, and breaks as soon as the key is a union.

Overload traps:

1. The **implementation signature is invisible** to callers. Only the
   overloads above it can be called.
2. A caller holding a **union** (`string | null`) matches neither
   `(input: string)` nor `(input: null)` on its own — overloads are tried one
   at a time, never combined. You need a last overload that accepts the union.
3. Order matters: the first overload that matches wins, so specific cases go
   first.

## Task

Export three functions.

**`toDate`** — parses an ISO string to a `Date`; `null` passes through as
`null`. Callers see: `string → Date`, `null → null`, `string | null →
Date | null`. `undefined` and numbers are compile errors.

**`getSetting(key)`** — reads from this exported interface and value (copy
them from the starter):

```ts
export interface Settings { theme: 'light' | 'dark'; pageSize: number; beta: boolean }
export const settings: Settings = { theme: 'light', pageSize: 20, beta: false };
```

`getSetting('pageSize')` is `number`; a key typed as the union
`'theme' | 'beta'` gives `'light' | 'dark' | boolean`; an unknown key is an
error.

**`findById(items, id, options?)`** — finds the item whose `id` matches.
Generic over the item type `T extends { id: string }`:

- `findById(users, 'u1')` → `T | undefined`
- `findById(users, 'u1', { required: true })` → `T`, and **throws** an `Error`
  when nothing matches
- `findById(users, 'u1', { required: false })` → `T | undefined`
- with `options: { required: boolean }` (not a literal) → `T | undefined`

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
