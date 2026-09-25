Permission code is set algebra written with arrays: `grants.concat(other)`
(duplicates), `a.filter((p) => b.includes(p))` (quadratic), a role that
inherits from itself (an infinite loop at login), and the classic —
`roleGrants.push(...extra)`, which quietly adds the extra permission to the
**role**, for every user, until the next deploy.

`Set` does this properly, and since Node 22 it has the algebra built in:
`a.union(b)`, `a.intersection(b)`, `a.difference(b)`,
`a.symmetricDifference(b)`, `a.isSubsetOf(b)`. They all return **new** sets.

## Task

Export three functions.

### `effectivePermissions(user, roles)` → `Set<string>`

- `roles` is a `Map` from role name to `{ grants: string[], inherits?: string[] }`.
  A role has its own grants plus everything its inherited roles have,
  transitively.
- `user` is `{ roles: string[], grants?: string[], denies?: string[] }`.
- The result is every permission granted by the user's roles (with
  inheritance) or by `user.grants`, **minus** `user.denies`. A deny always wins.
- A role name that is not in `roles` (directly or via `inherits`) throws an
  `Error` whose message contains `unknown role` and the name.
- Inheritance may contain **cycles** (`admin` → `ops` → `admin`); resolve each
  role once and do not loop.
- Never mutate `user`, `roles`, or any array inside them.

### `missingPermissions(required, granted)` → `string[]`

`required` is an array, `granted` a `Set`. Return the required permissions the
user does **not** have, in `required` order, without duplicates. A permission
`resource:action` is satisfied by the exact string, by `resource:*`, or by `*`.

### `permissionChanges(before, after)` → `{ added, removed }`

For an audit log: two `Set`s in, two **arrays** out, each sorted ascending by
code unit (`toSorted()` with no comparator).
