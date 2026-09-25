```ts
const Status = enumOf(['draft', 'published', 'archived']);
Status.parse(req.query.status); // : string
```

The helper exists to turn a list of allowed values into a union, and the union
is gone before it ever gets to work: an array literal passed to a plain generic
widens to `string[]`. The usual workaround is asking every caller to remember
`as const`. Callers forget. `as const` at the call site is a *convention*; a
**`const` type parameter** (TypeScript 5.0+) makes it part of the function's
signature:

```ts
function enumOf<const T extends readonly string[]>(values: T) { … }
enumOf(['draft', 'published']); // T = readonly ['draft', 'published']
```

Two traps:

- `const` only affects **literals written at the call site**. A variable
  declared as `const list = ['a', 'b']` is already `string[]` by the time it
  is passed in, and nothing can recover the literals. (That is fine — the spec
  checks it degrades to `string`, not that it errors.)
- Constrain with `readonly` arrays. A `readonly` constraint accepts both
  mutable and readonly arrays, so an `as const` array from elsewhere is still
  accepted.

## Task

Export **`enumOf(values)`**, returning `{ values, is, parse }`:

- `values` — the same array, typed as the **readonly tuple** of the literals:
  `enumOf(['a', 'b']).values` is `readonly ['a', 'b']`
- `is(value: unknown): value is <the union>` — `true` when `value` is one of them
- `parse(value: unknown): <the union>` — returns `value` if allowed, otherwise
  throws a `RangeError`

Export **`definePermissions(resources)`**. Its argument maps a resource to the
actions allowed on it:

```ts
const perms = definePermissions({ post: ['read', 'write'], comment: ['read', 'delete'] });
```

It returns `{ all, can }`:

- `all` — every permission string, `` `${resource}:${action}` ``, as an array
  typed `Permission[]` where `Permission` is the union
  `'post:read' | 'post:write' | 'comment:read' | 'comment:delete'`
- `can(granted: readonly Permission[], needed: Permission): boolean`
- An unknown permission such as `'post:delete'` is a compile error in both
  parameters of `can`.

Also export the helper type **`PermissionOf<R>`**, which computes that union
from the resources type (`PermissionOf<{ a: readonly ['x'] }>` is `'a:x'`).
The spec reaches the union of a real `perms` object through
`(typeof perms.all)[number]`.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
