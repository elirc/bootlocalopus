If a function calls `new Date()` and sends real email, its tests only work on
some days and spam real inboxes. So people mock everything. They stub the
module, assert that `send` was called three times in a particular order, and
end up with tests that break when someone reorders a loop and pass when the
wrong customer gets the email.

The fix is to **inject** the two things you do not control, the clock and the
mailer, and hand the function simple, honest doubles:

- a **stub** clock: `{ now: () => new Date('2024-03-10T09:00:00Z') }`, fixed
  and boring;
- a **fake** mailer that records what it was asked to send:
  `{ sent: [], async send(message) { this.sent.push(message); } }`.

Then assert on **outcomes**: who got an email, about which invoice, how late
it was. Do not assert on the sequence of calls.

## What `sendOverdueReminders` promises

`await sendOverdueReminders({ invoices, clock, mailer })`, where each invoice
is `{ id, customerEmail, dueDate: 'YYYY-MM-DD', paid }`:

- "Today" is `clock.now()`, compared by **UTC calendar day**. The function
  never looks at the real time.
- An invoice is **overdue from the day after** its `dueDate`. On the due date
  itself it is not overdue.
- Every unpaid, overdue invoice gets exactly one
  `mailer.send({ to, invoiceId, daysOverdue })`, where `to` is **that
  invoice's** `customerEmail` and `daysOverdue` is whole days past the due
  date (1 the day after).
- Paid invoices never get a reminder.
- The input can contain the **same invoice twice** (it comes from a join). It
  still gets only one email.
- It resolves to the ids that were reminded. **The order of the emails and of
  the returned ids is not part of the contract.**

## Your task

Write a test file that uses `describe` / `it` / `expect` against the global
`solution` (also available as `subject`).

- Write **at least 5 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** but sends in
  parallel, in reverse order. Assertions such as `sent[0].to === 'a@x'` or
  `expect(ids).toEqual(['1', '2'])` pin an order that is not promised. Sort
  first, or look messages up by `invoiceId`.
- Five planted bugs must each make at least one of your tests fail.

## The trap

One of the bugs reads the real clock. If your stub clock says 2024 and every
invoice is from 2023, the real clock (years later) gives the same answer, and
that bug survives. At least one test needs an invoice that is **not yet
overdue** by your stub clock but long overdue by today's date.
