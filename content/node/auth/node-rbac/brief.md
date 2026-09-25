Role checks scattered through handlers — `if (user.role === 'admin' || user.role === 'manager')`
— rot the moment a third role appears. Someone adds `billing-admin`, updates
four of the seven `if`s, and the other three quietly lock them out (or worse,
let them in). Role-based access control fixes this by asking one question
everywhere: **does this user have the permission `invoice:refund`?** Which
roles grant it is data, defined once.

The data model has its own traps:

- **Inheritance cycles.** `editor` inherits `viewer`, someone makes `viewer`
  inherit `editor`, and permission resolution recurses until the stack blows —
  in production, on the first request. Detect it when the config is loaded.
- **Diamonds are not cycles.** `admin` inherits both `editor` and `billing`,
  and both inherit `viewer`. Reaching `viewer` twice is fine. A cycle check
  that marks every visited role "seen" globally reports a false cycle here.
- **Wildcards by prefix.** `invoice:*` must grant `invoice:read`, not
  `invoices-archive:read`. Match on `resource:` including the colon.
- **Prototype keys.** `roles['constructor']` exists on every plain object. A
  user whose roles list contains `'constructor'` must not crash the check or
  inherit anything.

## Task

A permission is a string `resource:action`. A granted permission may also be
`resource:*` (every action on that resource) or `*` (everything).

Export `createRbac(roles)` where `roles` is a plain object:
`{ [roleName]: { permissions?: string[], inherits?: string[] } }`.

At creation time it throws an `Error`:

- whose message contains `unknown role` if any `inherits` names a role that is
  not an **own** key of `roles`;
- whose message contains `cycle` if a role inherits itself, directly or
  through others.

It returns:

- **`permissionsOf(role)`** → the role's effective permissions — its own plus
  everything it inherits, transitively — de-duplicated and sorted
  (`Array.prototype.sort`). An unknown role → `[]`.
- **`can(user, permission)`** → `true` if any of `user.roles` grants
  `permission`, else `false`. Granted `g` covers the requested `p` when
  `g === p`, `g === '*'`, or `g` is `resource:*` and `p` starts with
  `resource:`. Unknown role names, a missing or non-array `user.roles`, and a
  missing user all give `false`.

Export `requirePermission(rbac, permission)` returning middleware
`(req, res, next)`:

- no `req.user` → `401` `{ "error": "unauthorized" }`
- `rbac.can(req.user, permission)` is false → `403` `{ "error": "forbidden" }`
- otherwise call `next()` and send nothing.

Responses are JSON with `content-type: application/json`. Resolve inheritance
once, in `createRbac`, not on every `can` call.
