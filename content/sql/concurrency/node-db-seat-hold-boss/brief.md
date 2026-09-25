Ticket sales open at noon. Ten thousand people click at once, pick seats,
and get ten minutes to pay. The prototype checks availability in
JavaScript, then writes seat by seat with no transaction: two buyers read
"A2 is free" and both hold it; a request that fails half-way holds two of
four seats; baskets abandoned at 12:03 still block seats at 18:00; and a
double-click on "Pay" creates two orders.

Build the booking core so that none of that can happen. Everything from
this chapter applies: conditional writes, locks taken in a fixed order,
leases (a hold is one), and idempotent confirmation.

The fixture — times are 2024-05-01, UTC:

- `events`: 1 Keynote, 2 Workshop.
- `seats(id, event_id, label, held_by, held_until, order_id)`. A seat is
  **sold** when `order_id` is set, **held** when `held_by` is set and
  `held_until > now`, and otherwise **free** (a hold with `held_until <=
  now` has expired and counts as free). Keynote: A1–A3 (ids 1–3) free; A4
  (4) held by `tok-live` until 12:10; A5 (5) sold; A6 (6) held by `tok-old`
  until 11:55. Workshop: B1, B2 (7, 8) free.
- `orders(id, event_id, buyer, hold_token unique, created_at)`: order 1
  sold A5 to `zed`.

Time is always passed in as `now` (a `Date`). The error classes are in the
starter; `seatIds` on errors are sorted ascending.

## Task

1. **`holdSeats(conn, { eventId, seatIds, token, now, ttlMs })`** → `{ token,
   seatIds, expiresAt }`, with `seatIds` sorted ascending and `expiresAt = new
   Date(now + ttlMs)`.
   - Throw a `RangeError` before any query unless: `eventId` is a positive
     safe integer; `seatIds` a non-empty array of positive safe integers
     with no repeats; `token` a non-empty string; `now` a valid `Date`;
     `ttlMs` a positive safe integer.
   - In **one transaction**, hold every seat or none. Any id that is not a
     seat of `eventId` → `SeatNotFoundError` with those ids (this is checked
     first). Otherwise any seat that is sold, or held by a **different**
     token and not expired → `SeatUnavailableError` with those ids.
   - A seat held by the **same** token counts as available: holding again
     extends the hold, so a retried request is safe.
   - Lock the seats in ascending id order (`… order by id for update`) and
     put the availability rule in the `UPDATE`'s `WHERE`.
2. **`confirmHold(conn, { token, buyer, now })`** → `{ orderId, seatIds }`.
   RangeError unless `token` and `buyer` are non-empty strings and `now` is a
   valid `Date`. In one transaction:
   - an order with this `hold_token` already exists → return it (its id and
     its seats' ids, ascending) and change nothing;
   - otherwise the unsold seats held by `token` must exist and be unexpired
     (`held_until > now`), else `HoldExpiredError` (with `.token`);
   - insert the order (the seats' `event_id`, `buyer`, `token`) and mark the
     seats sold: `order_id` set, `held_by` and `held_until` cleared.
3. **`releaseHold(conn, token)`** → how many unsold seats it released
   (`held_by`/`held_until` cleared). Sold seats are never touched.
4. **`availableSeats(conn, { eventId, now })`** → `[{ id, label }]` of the
   event's free seats (including expired holds), by id.

On any error inside a transaction, roll back and rethrow the original
error. Every value goes in the parameter array.

## How it is graded

Through a connection with only `query`. Besides the rules above, the
grader:

- plays a **rival buyer** who holds seat A2 just before your first `UPDATE
  seats` — unless your transaction already has A2 locked, in which case,
  like Postgres, the rival waits. Your hold must then fail with
  `SeatUnavailableError([2])` rather than overwrite the rival's hold;
- injects failures into your `UPDATE seats` statements and expects nothing
  to change and the connection to be out of the transaction;
- plays an afternoon of overlapping holds, expiries, confirmations and a
  double-click, and checks which calls succeed and who owns every seat.

Out of scope, but true in production: two first confirmations of the same
token racing each other — the loser hits the `hold_token` unique
constraint and its retry finds the order.
