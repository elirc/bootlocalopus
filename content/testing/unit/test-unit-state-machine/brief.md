The order workflow has tests for checkout, pay, ship and deliver, and they
all pass. Then support finds orders that are `cancelled` **and** delivered.
Someone added `cancel` to the `shipped` row "for the returns project", and
nothing failed, because no test ever tried a move that should be
**forbidden**.

A state machine is a table: every status crossed with every event is either
a legal move or an error. The legal moves are a short list, and the illegal
ones are most of the table. You don't have to type the illegal ones out.
**Generate** them: loop over every status and every event, skip the legal
pairs, and expect each of the rest to throw.

## The functions under test

`nextStatus(status, event)` returns the new status. These are the **only**
legal moves:

| status | event → next status |
| --- | --- |
| `cart` | `checkout` → `pending_payment`, `cancel` → `cancelled` |
| `pending_payment` | `pay` → `paid`, `payment_failed` → `cart`, `cancel` → `cancelled` |
| `paid` | `ship` → `shipped`, `cancel` → `cancelled` |
| `shipped` | `deliver` → `delivered` |
| `delivered` | `refund` → `refunded` |
| `cancelled`, `refunded` | nothing: these are terminal |

Every other combination throws an **`InvalidTransition`** (exported as
`solution.InvalidTransition`) with `from` set to the status and `event` set
to the event. That includes unknown statuses and unknown events. Both come
from API requests, so **names like `toString` must throw too**.

`allowedEvents(status)` returns the legal events for a status, sorted
**alphabetically**, and `[]` for a terminal or unknown status.

## Your task

Write a test file that uses `describe` / `it` / `expect` against the global
`solution` (also available as `subject`).

- Write **at least 7 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** (a
  `switch` instead of a lookup table, with a different error message).
  Assert on the error's class and its `from` / `event`, not its message.
- Seven planted bugs must each make at least one of your tests fail.

## The trap

Three of the bugs *add* a move, and a test of the happy path can never see a
move being added. Neither can a single "cancel a shipped order throws" test,
because the bug may be in a different row. The generated matrix of forbidden
pairs catches all of them. Hand-picked examples don't.
