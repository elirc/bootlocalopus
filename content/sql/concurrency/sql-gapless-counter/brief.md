Invoices are numbered from a sequence, and the auditor has found invoice
4,812 but no 4,811. Nothing was deleted: a request took 4,811, failed a
check, and rolled back. **Sequences are not transactional.** `nextval` never
gives a number back, because giving it back would mean making every other
transaction wait for yours to finish. That is the right trade for primary
keys and the wrong one for invoice numbers, which many tax regimes require to
be consecutive per issuer.

A gapless counter has to be ordinary data in a row: the increment is then
part of your transaction, a rollback undoes it, and the row lock taken by the
`UPDATE` makes a second transaction for the same tenant **wait** until yours
commits, then increment the value that survived. The price is exactly that
wait — invoice creation is serialised per tenant — which is why you only do
this where the law or the business demands it.

The fixture: `tenants(id text, name)` with `acme`, `globex` and `initech`;
`invoices(id serial, tenant_id, number, amount_cents check (> 0),
issued_at)`, unique on `(tenant_id, number)`. Acme has issued 1–3, Globex
11–12, Initech nothing.

## Task

Replace the starter's sequence (you can drop it or leave it unused):

1. Create `invoice_counters(tenant_id text primary key references
   tenants(id), last_number integer not null)`.
2. **Seed it** from the invoices already issued, so numbering carries on:
   Acme continues at 4, Globex at 13. (A tenant with no invoices may have no
   row yet, or a row with `0`.)
3. `next_invoice_number(p_tenant text) returns integer`: increments the
   tenant's counter and returns the new value. A tenant without a counter row
   gets one, starting at `1`. An unknown tenant fails with the foreign key
   violation (`23503`).
4. `create_invoice(p_tenant text, p_amount_cents integer) returns invoices`:
   inserts an invoice with the next number and returns the whole row.

Do it with one statement per function: an `insert … on conflict (tenant_id)
do update set last_number = … + 1 returning last_number` both creates and
increments the counter. Do **not** compute `max(number) + 1` from `invoices`:
two transactions would read the same max (and each call must hand out a new
number even before an invoice is inserted).

## How it is graded

Each test runs in a transaction that is rolled back; inside it the grader
calls your functions and uses savepoints to roll back part of the work:

- the counters are seeded (`acme` 3, `globex` 12), and numbers continue
  from there, per tenant, independently;
- a number taken inside a savepoint that is rolled back is handed out again;
- a `create_invoice` that fails the amount `CHECK` (`23514`) leaves no gap,
  and a run of successes, failures and rollbacks yields exactly `1..n`;
- `invoice_counters.last_number` always holds the last number handed out.

The grader's database has one connection, so it cannot show the second
transaction waiting. In production, that wait is the whole point.
