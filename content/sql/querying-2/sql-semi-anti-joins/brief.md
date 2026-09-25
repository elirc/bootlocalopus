Two questions come up constantly: "which X have **at least one** Y?" and
"which X have **no** Y?". They have names — **semi-join** and **anti-join** —
and each has a classic wrong answer.

- **Semi-join done with a join.** `customers join orders` returns a customer
  once *per matching order*; bolting `distinct` on hides it until someone adds
  a column. `where exists (select 1 from orders ...)` asks the actual
  question, returns each customer once, and stops at the first match.
- **Anti-join done with `NOT IN`.** `x not in (select email from suppressions)`
  is **never true** if the subquery returns a single `NULL`: `x <> NULL` is
  unknown, not true. One bad row in a suppression list and your campaign query
  silently returns nobody (or, if you flipped the logic, everybody).
  `where not exists (...)` has no such trap.

The fixture has `customers(id, name, email, marketing_opt_in)`,
`orders(id, customer_id, status, total_cents)` and `suppressions(id, email,
reason)` — the addresses that must never be emailed. Some suppression rows have
a different letter case from the customer's address, and one has a `NULL`
email (an import that went wrong; it must not break anything).

## Task

Write **exactly two** statements. The grader reads the rows of each.

**1. Big spenders** — every customer with at least one `paid` order of
`total_cents >= 10000`. Columns `id`, `name`; order by `id`. Each customer
appears once, however many such orders they have.

**2. Win-back audience** — every customer who:

- has `marketing_opt_in = true`,
- has **no** `paid` order (other statuses do not count), and
- is not suppressed: no suppression row whose email matches theirs
  **ignoring case**.

Columns `id`, `email`; order by `id`.
