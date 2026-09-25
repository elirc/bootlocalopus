An event has 40 places and a waitlist. The first version of the module was
an object with `confirmed` and `waiting` arrays on it, and within a month:
checkout read `list.confirmed.length` to decide if the event was full, the
admin page pushed people straight onto `list.waiting` (skipping the duplicate
check), and a support script ran `list.capacity = 500` so nobody on the
waitlist was ever promoted. The rules lived in `join()`, but nothing had to go
through `join()`.

A module can only keep a promise ("never more attendees than places", "the
waitlist is first come, first served") if **every** change goes through its
functions. That means a small surface of verbs, and never handing out a
reference to the state itself — not the arrays, not the objects inside them,
and not keeping a reference to the objects callers hand *in*.

## Task

Export `createWaitlist({ capacity })`. `capacity` must be a positive integer,
otherwise throw a `RangeError`. A person is a flat object
`{ id, name, email }`. It returns:

| method | behaviour |
| --- | --- |
| `join(person)` | `{ status: 'confirmed' }` if there is room, otherwise `{ status: 'waitlisted', position }` (1-based). Throws an `Error` if that `id` is already confirmed or waiting. |
| `leave(id)` | Removes the person. If they were confirmed, promote from the front of the waitlist to refill the place. Returns `{ removed, promoted }`, `promoted` being the ids promoted (in order, possibly `[]`). Unknown id → `{ removed: false, promoted: [] }`. |
| `setCapacity(n)` | `n` must be a positive integer (`RangeError`) and not below the number already confirmed (`RangeError`, nothing changes). Raising it promotes from the waitlist; returns the promoted ids. |
| `statusOf(id)` | `{ status: 'confirmed' }`, `{ status: 'waitlisted', position }`, or `null`. |
| `attendees()`, `waiting()` | the people, in order (promoted people join the end of `attendees()`). |
| `capacity` | the current capacity, read-only. |

**The encapsulation rules** — each has a test that tries to break it from
outside:

- Pushing to, splicing or emptying an array returned by `attendees()` or
  `waiting()` changes nothing inside the waitlist.
- Changing a field on a person object you got back changes nothing inside.
  (Returning a copy or a frozen copy both pass.)
- Changing the object you passed to `join()` **afterwards** changes nothing
  inside: store your own copy.
- `waitlist.capacity = 50` has no effect; only `setCapacity` changes it.
- After any sequence of calls: no one is in both lists or in one twice,
  confirmed never exceeds capacity, and nobody waits while a place is free.

## The traps

- `return confirmed` hands out your array. `[...confirmed]` protects the
  array but not the objects in it — `attendees()[0].id = 'x'` would still
  rename a stored person.
- A plain `capacity` property can be assigned by anyone. Keep the value in the
  closure and expose a getter.
