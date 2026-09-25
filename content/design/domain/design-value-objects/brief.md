A booking system passes emails around as strings and stays as
`{ checkIn, checkOut }` objects. So `'Ada@Example.com'` and
`'ada@example.com'` are two different customers; one handler validates dates
and three do not; a stay from the 4th to the 1st makes it to the database;
someone writes `stay.checkOut = …` in a template helper; and the overlap check
is written four times, two of them treating back-to-back bookings as a
clash.

A **value object** fixes the whole class of bug. It is:

- **valid by construction** — the only way to get one is through a factory
  that validates and normalises, so any instance you hold is good;
- **immutable** — changing it means making a new one;
- **equal by value** — two instances with the same value are the same thing;
- **the home of its own behaviour** — nights, containment and overlap live
  on the range, once.

## Task

Export `InvalidValueError` (extends `Error`, `name` `'InvalidValueError'`),
thrown for every invalid input below, and two value objects.

**`EmailAddress.parse(input)`** — `input` must be a string. Trim and lowercase
it; it must then match `local@domain.tld` with no whitespace. The instance has:

- `value` (the normalised string) and `domain` (the part after the `@`);
- `equals(other)` — `true` only for another `EmailAddress` with the same
  value (not a string, not a look-alike object);
- `toString()` and `toJSON()` returning `value`, so it prints and serialises
  as a plain string.

**`DateRange.of(start, end)`** — a hotel stay. `start` (check-in) and `end`
(check-out) are strings in exactly `YYYY-MM-DD` form and must be real
calendar dates (`2024-02-30` and `2023-02-29` are not). `end` must be after
`start`. The instance has:

- `start`, `end`, and `nights` (days between them);
- `contains(date)` — `start` inclusive, `end` **exclusive** (you do not sleep
  there on the check-out day);
- `overlaps(other)` — `true` when the two share at least one night;
  back-to-back stays (one ends the day the other starts) do **not** overlap;
- `withEnd(end)` — a **new**, validated range with the same start;
- `equals(other)` — another `DateRange` with the same dates;
- `toJSON()` → `{ start, end }`.

Neither object can be changed after creation: assigning to `value`, `start`,
etc. must have no effect (a getter without a setter, a frozen object, or
private fields all work).

## The traps

- `new Date('2024-02-30')` is `Invalid Date`, but `Date.UTC(2024, 1, 30)` is
  1 March. Build the date, then check that year, month and day came back
  unchanged.
- Count nights in UTC (`Date.UTC`), not local time, or a daylight-saving
  change turns a 2-night stay into 1.958 nights.
- For half-open ranges, overlap is `a.start < b.end && b.start < a.end`.
  `<=` in either place makes back-to-back bookings clash.
- `YYYY-MM-DD` strings sort and compare correctly as strings; no `Date` is
  needed for `contains` or `overlaps`.
