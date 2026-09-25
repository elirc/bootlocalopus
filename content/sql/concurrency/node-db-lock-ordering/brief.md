A ride costs 1,000 cents: the rider pays 1,000, the driver gets 800, the
platform keeps 200. One payment, three wallets, one transaction. The code
walks the lines in the order the caller gave them and updates each wallet.

It works for months. Then, on a busy Friday, Postgres starts killing
transactions with `ERROR: deadlock detected`. Payment A (ada → bob) updates
ada's wallet, then wants bob's. Payment B (a refund, bob → ada) has already
updated bob's and now wants ada's. Each holds the lock the other needs;
neither can move; after a second Postgres aborts one of them.

Row locks are taken in whatever order your statements touch rows. The fix is
not a retry loop — it is to **take locks in one global order**, for example
ascending id. If every transaction locks wallet 2 before wallet 3, two
transactions can wait for each other but never in a circle.

The fixture: `wallets(id int, owner, balance_cents >= 0)` with ids 1–6,
`payments(id serial, memo)` and `payment_lines(payment_id, wallet_id,
amount_cents <> 0)`.

## Task

Write `postPayment(conn, { memo, lines })`, where `lines` is an array of
`{ walletId, amountCents }` (negative takes money out of a wallet, positive
puts it in). It resolves to exactly `{ paymentId, balances }`, where
`balances` is `[{ walletId, balanceCents }, …]` — every wallet in the payment
with its new balance, sorted by `walletId` ascending.

1. **Validate first**, and throw a `RangeError` before any query unless:
   `memo` is a non-empty string; `lines` is an array of at least 2 lines;
   every `walletId` is a positive safe integer and appears only once; every
   `amountCents` is a non-zero safe integer; and the amounts sum to exactly 0.
2. **One transaction**; on any error `rollback` and rethrow the original.
3. **Lock the wallets in ascending id order**, whatever order the lines came
   in. Either lock them all in one statement that sorts —
   `select id, balance_cents from wallets where id = any($1::int[]) order by
   id for update` — or update them one by one in ascending id order.
4. A wallet that does not exist → `WalletNotFoundError` (with `.walletId`).
   A wallet that would go below 0 → `InsufficientFundsError` (with
   `.walletId`). Either way nothing changes.
5. Apply the amounts, insert the `payments` row and one `payment_lines` row
   per line.

The error classes are in the starter.

## How it is graded

After every statement you send, the grader looks at which wallet rows your
open transaction has locked or updated. Each statement may only lock wallets
with **higher ids than every wallet already locked**; and a single statement
that locks several wallets at once must contain an `ORDER BY` (without one,
Postgres locks rows in whatever order it happens to read them). Lines arrive
deliberately out of order. Balances must add up to the same total after every
payment, successful or not.
