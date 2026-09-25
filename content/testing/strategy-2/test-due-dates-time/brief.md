A test that calls `dueLabel('2024-03-11')` and expects `'due tomorrow'`
passes on the day it was written and fails every day after. The usual "fix",
computing the expected date from `new Date()` inside the test, is worse: the
test now repeats the code's own maths, so it agrees with the code even when
both are wrong, and it still fails at 23:59 when the two `new Date()` calls
land on different days.

Deterministic time means the code **takes the clock as a parameter** and the
test **pins it** to an instant it chose on purpose. Then pick the instants that
break date code: just before and after midnight, a user whose midnight is not
UTC's, and the end of a month.

## What `dueLabel` promises

`dueLabel(dueDate, { now, timeZone })` labels a task due on the calendar date
`dueDate` (`'YYYY-MM-DD'`) for a user in the IANA `timeZone` (for example
`'Asia/Tokyo'`). `now` is a function returning milliseconds since the epoch,
like `Date.now`. Both options have defaults (`Date.now`, `'UTC'`), and your
tests should always pass both.

- "Today" is the calendar date that `now()` falls on **in `timeZone`**. At
  `2024-06-30T20:00:00Z` it is already `2024-07-01` in Tokyo (UTC+9).
- `days` is the number of **calendar days** from today to `dueDate`. The time
  of day does not matter: at 23:59 a task due tomorrow is still one day away.
- The label, by `days`:
  - less than 0: `'overdue by 1 day'` or `'overdue by N days'`
  - 0: `'due today'`
  - 1: `'due tomorrow'`
  - more than 1: `'due in N days'`

## Your task

Write a test file against the global `solution` (also available as
`subject`). The starter has a `clockAt(iso)` helper that returns a `now`
function frozen at that instant.

- Write **at least 6 tests**, each with an assertion.
- The suite must pass against a rewrite that formats dates differently.
- Five planted bugs must each fail at least one of your tests. One of them
  reads the real clock, so it is today's date on the machine running your
  tests.

## The trap

A test clock set to midnight UTC (`'2024-03-10T00:00:00Z'`) is the one
instant where several of these bugs give the right answer: counting 24-hour
periods is the same as counting days at midnight, and UTC's date is everyone's
date for a moment in some zones. Use instants in the middle of the day and
late in the evening, and at least one time zone far from UTC. And pick a
clock that is **not** anywhere near the real date, so a bug that ignores it
cannot agree by accident.
