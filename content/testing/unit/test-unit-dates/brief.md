"Your refund will arrive within 3 business days." A customer asks on a
Friday and is told Tuesday. It should have been Wednesday: the code counted
Friday itself as day one. The test suite had one test, and it called
`addBusinessDays(today(), 3)` and checked that the result was later than
today. It passed on every day of the week, including the days when the
answer was wrong.

Date arithmetic goes wrong in the same few places every time: **Fridays and
Mondays** (crossing a weekend), **holidays**, **month and year ends**, and
whether the **start day** counts. A good date test uses **fixed dates**
whose weekdays you have looked up. Never use "today", because a test that
depends on the calendar gives a different answer depending on when it runs.

## The function under test

`addBusinessDays(isoDate, n, { holidays = [] } = {})` takes a date as
`'YYYY-MM-DD'` and returns the date `n` business days later, in the same
format.

- A business day is Monday–Friday and **not** in `holidays` (an array of
  `'YYYY-MM-DD'` strings).
- The **start date is never counted**. Friday + 1 is the following Monday,
  whatever day you start on. Saturday + 1 is Monday as well.
- A **negative** `n` counts backwards. Monday − 1 is the previous Friday.
- `n = 0` returns the date **unchanged**, even on a weekend or a holiday.
- It works on calendar dates in UTC, so the machine's time zone never
  matters.

Some weekdays to save you a calendar: `2024-03-01` is a **Friday**,
`2024-02-29` a Thursday, `2024-03-04` a Monday, `2024-12-24` a Tuesday,
`2024-12-31` a Tuesday.

## Your task

Write a test file that uses `describe` / `it` / `expect` against the global
`solution` (also available as `subject`).

- Write **at least 6 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** (a
  mutable `Date` stepped with `setUTCDate`).
- Five planted bugs must each make at least one of your tests fail.

## The trap

Starting on a Monday and adding 1 gives Tuesday under almost every bug,
because nothing interesting happens mid-week. Start on the days where the
rules matter: a Friday, a Monday going backwards, a weekend, the day before
a holiday.
