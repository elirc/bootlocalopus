Every booking system gets the same bug report: two teams turn up to the same
meeting room. The code checked for a clash (`select ... where overlaps`)
and then inserted — and two requests did the check at the same moment, both
saw a free room, and both inserted. No amount of application code fixes that
without locking. A constraint does.

This boss puts the chapter together: ranges as a type, an **exclusion
constraint**, a cross-table rule in a trigger, and a function that answers the
question the UI actually asks.

## Background

- `tstzrange` is a range of timestamps. `tstzrange(a, b)` is half-open,
  `[a, b)`, so a 10:00–11:00 booking and an 11:00–12:00 booking do not overlap.
  `&&` is "overlaps"; `upper(r) - lower(r)` is its length; `isempty(r)`,
  `lower_inc(r)`, `upper_inc(r)`, `lower_inf(r)`, `upper_inf(r)` inspect it.
- An **exclusion constraint** generalises `unique`: "no two rows where *these
  operators* all return true". It is enforced with index locks, so two
  concurrent inserts cannot both pass.
  ```sql
  exclude using gist (room_id with =, during with &&)
  ```
  is the production form, and needs `create extension btree_gist` for the
  `int =` part. That extension is not available here, so compare the room as a
  one-element range instead, which GiST supports natively:
  `int4range(room_id, room_id, '[]') with =`.
- An exclusion constraint can be partial: `... where (cancelled_at is null)`.
- A violation of an exclusion constraint has code `23P01`.

The fixture has `rooms(id serial primary key, name text not null unique,
capacity int not null)`: `Attic` (4), `Boardroom` (12), `Cube` (2).

## Task

**1. `bookings`**

| column | rule |
| --- | --- |
| `id` | auto-incrementing primary key |
| `room_id` | required, references `rooms(id)`; a room with bookings cannot be deleted (`23503`) |
| `booked_by` | text, required |
| `attendees` | int, required, greater than 0 |
| `during` | `tstzrange`, required |
| `cancelled_at` | `timestamptz`, nullable; set means cancelled |

**2. Checks on `during`** — each a check violation (`23514`) when broken: not
empty; bounded at both ends; bounds exactly `[)` (inclusive start, exclusive
end); at most **4 hours** long (exactly 4 is fine).

**3. No double booking.** Two bookings of the same room whose `during`
overlap cannot both be active (not cancelled): `23P01`. A cancelled booking
blocks nothing, and un-cancelling one that now clashes must fail.

**4. Capacity.** `attendees` must not exceed the room's `capacity`, checked on
insert and on any update to `attendees` or `room_id`. Raise
`'room capacity exceeded'` with `errcode = 'check_violation'`.

**5. `free_rooms(p_during tstzrange, p_attendees int)`** returns
`table (room_id int, name text, capacity int)`: every room with capacity for
`p_attendees` and no active booking overlapping `p_during`, ordered by
`capacity` then `room_id` — the smallest room that fits comes first.
