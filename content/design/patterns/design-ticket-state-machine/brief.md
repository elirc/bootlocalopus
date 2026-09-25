A support ticket starts with `isAssigned`, then gains `isResolved`, then
`waitingOnCustomer`, then `isClosed`. Four booleans are sixteen combinations,
most of them nonsense ("closed, waiting on the customer, unassigned"), and
every handler re-derives which ones are legal with its own `if`s. Sooner or
later a closed ticket gets reassigned in production.

An **explicit state machine** has one `status` and a table of which events are
legal in which status. Everything else is rejected in one place, with an
error that says what was attempted.

## Task

A ticket is `{ id, status, assignee, resolvedAt }`. Export:

- `createTicket(id)` → `{ id, status: 'open', assignee: null, resolvedAt: null }`
- `transition(ticket, event)` → a **new** ticket (never mutate the input), or
  throw `InvalidTransitionError`.
- `can(ticket, event)` → `true` exactly when `transition` would succeed.
- `InvalidTransitionError` — extends `Error`, `name` `'InvalidTransitionError'`,
  with `from` (the ticket's status) and `event` (the event's `type`).

The rules:

| status | event | → status | changes |
| --- | --- | --- | --- |
| `open` | `{ type: 'ASSIGN', agent }` | `assigned` | `assignee = agent` |
| `open` | `{ type: 'CLOSE' }` | `closed` | (closing spam) |
| `assigned` | `{ type: 'ASSIGN', agent }` | `assigned` | `assignee = agent` |
| `assigned` | `{ type: 'ASK_CUSTOMER' }` | `waiting` | |
| `assigned`, `waiting` | `{ type: 'RESOLVE', at }` | `resolved` | `resolvedAt = at` |
| `waiting` | `{ type: 'CUSTOMER_REPLIED', at }` | `assigned` | |
| `resolved` | `{ type: 'CUSTOMER_REPLIED', at }` | `assigned` | `resolvedAt = null` — **only if** `at - resolvedAt <= REOPEN_WINDOW_MS` |
| `resolved` | `{ type: 'CLOSE' }` | `closed` | |
| `closed` | anything | — | always invalid |

Export `REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000`. Times (`at`) are epoch
milliseconds carried on the event; the machine never reads the clock itself.

Anything not in the table — including an unknown event type, and a reply to a
resolved ticket outside the window — throws `InvalidTransitionError`.

## The traps

- A guard (the reopen window) is part of "is this legal?", so `can` must
  apply it too. If `can` and `transition` are written separately they will
  drift; derive one from the other.
- Assigning keeps whoever the new agent is; a reopened ticket keeps its old
  assignee. Carry fields forward with a spread, then change only what the row
  says changes.
- If your table is a plain object, `table.open['toString']` is a function
  inherited from `Object.prototype`. Event types come from outside; look them
  up with `Object.hasOwn` (or use a `Map`).
