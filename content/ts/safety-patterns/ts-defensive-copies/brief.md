```ts
const standup = Schedule.create('standup', [monday]);
monday.setDate(monday.getDate() + 7);   // the caller reuses its Date for next week
standup.slots[0];                       // …and the schedule moved with it
```

`readonly` in a type is a promise about **this reference**, checked at compile
time. It says nothing about who else holds the same objects at runtime. A
value object that keeps the array or the `Date` its caller passed in — or
hands its own out — shares mutable state with code it has never heard of.
`Date` is the classic case: it is mutable (`setHours`, `setDate`), it is
everywhere, and a `readonly Date[]` happily lets anyone call `setHours` on its
elements.

The defence is old and boring and works: **copy on the way in, copy on the way
out**, keep the state private, and make every "update" return a new object.
Storing times as numbers (`getTime()`) internally is one easy way to make the
inside immune; freezing the arrays you hand out is another layer.

## Task

Rewrite **`Schedule`**, an immutable list of time slots:

- **`Schedule.create(name, slots)`** — `slots` is any iterable of `Date`s.
  Slots are stored sorted ascending, with duplicates (same time) removed. An
  invalid date (`getTime()` is `NaN`) throws a `RangeError`. Mutating the
  array or any `Date` passed in, afterwards, must not affect the schedule.
- **`name`** — read-only (assigning to it from outside must not change it).
- **`size`** — the number of slots.
- **`slots`** — a **frozen** array of **new** `Date` copies each time it is
  read: mutating a returned `Date` or pushing to the returned array
  (a `TypeError`, since it is frozen) must not affect the schedule.
- **`withSlot(date)`** — returns a **new** schedule with the slot added (kept
  sorted, duplicates ignored, the date copied, an invalid date is a
  `RangeError`). The original is unchanged.
- **`withoutSlot(date)`** — returns a new schedule without any slot at that
  **time** (compare times, not object identity).
- **`next(after)`** — a copy of the first slot strictly after `after`, or
  `undefined`.
- **`toJSON()`** — `{ name, slots }` with the slots as ISO strings, so
  `JSON.stringify(schedule)` works.

The trap is copying the array but not the dates: `[...slots]` is a new array
of the **same** `Date` objects.
