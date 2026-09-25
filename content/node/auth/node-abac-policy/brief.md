Roles answer "what kind of user is this?". Real rules are about the **object**
too: you may edit a document *you own*, *in your own tenant*, *unless it is
archived*; you may delete it *only after MFA*. That is attribute-based access
control (ABAC): decisions computed from the subject, the action, the resource
and the context.

Written as nested `if`s in each handler, these rules get the three classic
bugs:

- **Allow wins by accident.** An early `return true` for "owners may edit"
  skips the later "nobody edits an archived document". In a policy engine,
  **deny overrides allow**: every matching rule is considered, and one deny beats
  any number of allows.
- **Default allow.** Nothing matched, so the code falls off the end of the
  function and returns… whatever the last line happened to be. Nothing
  matching must mean **deny**.
- **Fail open.** A rule reads `resource.sharedWith.includes(...)` on a document
  with no `sharedWith`, throws, and a `try/catch` somewhere upstream turns that
  into "carry on". A rule that throws must count as a **deny**.

## Task 1: the engine

Export `createPolicy(rules)` returning `{ evaluate(request) }`. A rule is
`{ id, effect: 'allow' | 'deny', actions: string[], when(request) }`; a
request is `{ subject, action, resource, context }`.

A rule **applies** when its `actions` include `request.action` or `'*'`. For
each applying rule, call `when(request)`; the rule **matches** only if it
returns exactly `true` (a forgotten `return` is `undefined`, not a match).

`evaluate` returns `{ allowed, reason }`:

1. If any applying rule's `when` **throws**, or any deny rule matches →
   `{ allowed: false, reason }` for the **first** such rule in array order,
   with `reason` `'error:<id>'` for a throw and `'deny:<id>'` for a deny.
2. Otherwise, if an allow rule matched → `{ allowed: true, reason: 'allow:<id>' }`
   for the first one.
3. Otherwise `{ allowed: false, reason: 'default-deny' }`.

## Task 2: the rules

Export `documentRules`, an array in **exactly this order**, for a
multi-tenant documents app. The subject is `{ id, tenantId, role }` (`role` is
`'member'` or `'admin'`); the resource is
`{ ownerId, tenantId, status, sharedWith? }` (`status` is `'draft'`,
`'published'` or `'archived'`; `sharedWith` is an array of user ids, **or
missing**); the context is `{ mfa: boolean }`. Actions are `read`, `edit`,
`delete`.

| id | effect | actions | matches when |
| --- | --- | --- | --- |
| `cross-tenant` | deny | `*` | the subject's tenant is not the resource's |
| `archived-read-only` | deny | `edit` | the resource is archived |
| `delete-needs-mfa` | deny | `delete` | `context.mfa` is not `true` |
| `owner` | allow | `read`, `edit`, `delete` | the subject owns the resource |
| `shared-read` | allow | `read` | the subject's id is in `sharedWith` |
| `published-read` | allow | `read` | the resource is published |
| `tenant-admin` | allow | `read`, `edit`, `delete` | the subject's role is `'admin'` |

The grader runs `documentRules` through **your** `createPolicy` and through
its own reference engine, and expects the same decisions — so a missing
`sharedWith` must be handled in the rule, not left to the engine's
"throw means deny".
