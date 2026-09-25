The workshop has 10 seats and 6 are booked. Two people book 3 seats at the
same moment. Both requests run `select sum(seats) … where event_id = 1`, both
see 6, both decide 6 + 3 fits, and both insert. The workshop now has 12
people and 10 chairs.

A transaction does not stop this. Under Postgres's default READ COMMITTED
each statement sees what was committed when it started, and the other
request's `INSERT` is a new row — there was nothing for you to lock when you
summed. No single-row `CHECK` can express "the bookings add up to at most the
capacity" either: the rule spans many rows.

The standard fix is to **lock the parent row**. Every booking for an event
first takes `SELECT … FROM events WHERE id = $1 FOR UPDATE`. The second
request blocks on that lock until the first commits, and only then reads the
sum — which now includes the first booking. The bookings are serialised per
event; bookings for different events never wait for each other.

The fixture: `events(id, name, capacity)` — 1 is the workshop (capacity 10,
6 booked by ada and bob), 2 a meetup (3, none booked), 3 a talk (2, sold out)
— and `bookings(id serial, event_id, customer, seats > 0, created_at)`.

## Task

Write `book(conn, { eventId, customer, seats })`. It resolves to exactly
`{ bookingId, seatsLeft }`: the new booking's id and the seats still free
after it.

1. **Validate first.** `seats` is a positive safe integer and `customer` a
   non-empty string; otherwise throw a `RangeError` before any query.
2. **One transaction:** `begin` … `commit`; on any error, `rollback` and
   rethrow the original error. No path leaves the connection in a transaction.
3. **Lock the event row first, in its own statement:**
   `select capacity from events where id = $1 for update`. No row →
   `EventNotFoundError` (with `.eventId`).
4. **Then** read the seats already booked, and if the new booking does not
   fit, throw `SoldOutError` with `.eventId` and `.seatsLeft` (the free seats
   now). A booking that exactly fills the event is fine.
5. Insert the booking.

The error classes are in the starter.

## How it is graded

A rival request books seats for the same event, landing **right after your
first statement that reads or writes `bookings`**. The grader decides whether
it could get in by looking at the event row at the moment that statement was
sent: if your transaction had already locked (or updated) it, the rival waits
and runs after you commit, with the same rules. If not, the rival commits in
between — and a request that decided from a stale sum overbooks the event.
After every scenario the bookings of each event must add up to at most its
capacity.

That is why the lock must come **before** the read, as a separate statement.
`select … from events where id = $1 for update` with the sum in a subquery of
the same statement looks equivalent, but the subquery reads the snapshot the
statement started with — from before it waited for the lock.
