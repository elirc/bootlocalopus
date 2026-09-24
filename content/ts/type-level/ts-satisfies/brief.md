`as const` keeps literal types instead of widening to `string`.
`satisfies` checks a value against a type **without** widening it — so you get
validation *and* the precise literal types.

## Task

Given a `ROLES` config, export:

- `ROLES` — frozen literal types, validated against
  `Record<string, { level: number; label: string }>` via `satisfies`
- `Role` — the union `'viewer' | 'editor' | 'admin'`, derived from `ROLES`
  (do not type it out by hand)
- `RoleLevel` — the union of the `level` values: `1 | 2 | 3`
- `hasAtLeast(role: Role, min: Role): boolean`
- `STATUSES` — a readonly tuple `['todo', 'doing', 'done']`
- `Status` — the union of its members
- `defineRoles(roles)` — see below

The spec proves `ROLES.admin.level` is `3` (not `number`) and that unknown
roles are rejected.

### Making `satisfies` reusable

A spec in another file cannot see whether you wrote `satisfies` on `ROLES` —
delete it and `ROLES` has the same type. Its value is at the point of
definition: a typo'd `levle` is caught there. When *other* modules define
role maps (plugins, per-tenant config), you want that same check at their call
site. The packaged form of `satisfies` is a generic identity function:

```ts
defineRoles<const T extends Record<string, { level: number; label: string }>>(roles: T): T
```

The constraint does the checking, and the `const` type parameter keeps the
literals (`level: 7`, not `number`) exactly like `as const`. The spec calls it
with a valid map (and expects the literals to survive) and with a malformed
one (and expects a compile error).