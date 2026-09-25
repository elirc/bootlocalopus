The nightly renewal job has a test suite, and the suite is green. It is also
useless. Every test copies a forty-line subscription literal, the clock is
`new Date()` so the "due today" test fails after midnight and was skipped, the
payment gateway is mocked with `expect(charge).toHaveBeenNthCalledWith(1, …)`
so the one refactor that made charges concurrent broke eleven tests, and not
one test covers the case that cost real money last quarter: a customer
charged twice because the same subscription appeared twice in a join.

This boss is the whole chapter at once. Replace that suite with one that is
**deterministic** (an injected clock, pinned on purpose), **readable** (a
builder, one fact per test), **honest about its doubles** (a fake gateway that
records what it was asked, checked by outcome, not by call order) and
**sharp** (it catches every planted bug and survives a rewrite).

## What `renewDue` promises

`await renewDue(subscriptions, { now, charge })`. A subscription is:

```js
{
  id: 'sub_1', customerId: 'cus_1',
  plan: 'monthly',              // or 'annual'
  priceCents: 1200,
  status: 'active',             // or 'paused' or 'cancelled'
  renewsAt: '2031-05-10T08:00:00.000Z',
}
```

- **Today** is `now()`, milliseconds since the epoch. The function never
  reads the real clock.
- A subscription is **due** when its `status` is `'active'` and `renewsAt` is
  at or before `now()`. **Exactly at** `renewsAt` is due. Paused and cancelled
  subscriptions are never charged.
- The input can contain the **same subscription id more than once**. Each id
  is charged at most once per run.
- Each due subscription gets one
  `await charge({ customerId, amountCents, idempotencyKey })`, where
  `amountCents` is its `priceCents` and `idempotencyKey` is exactly
  `` `renew-${id}-${renewsAt}` ``. The key must be the same if the job is
  retried later for the same period, which is what stops the gateway charging
  twice.
- `charge` resolves to `{ ok: true }` or `{ ok: false, reason }`. It can also
  throw or reject (a network error). That subscription then fails with
  reason `'error'`. **One failure never stops the other charges.**
- It resolves to `{ renewed, failed }`:
  - `renewed`: `{ id, renewsAt }` for each successful charge, where `renewsAt`
    is the **next** renewal: one calendar month later for `'monthly'`, twelve
    for `'annual'`, same UTC time of day, **clamped to the last day of a
    shorter month** (31 January → 29 February 2032; 29 February 2032 annual →
    28 February 2033).
  - `failed`: `{ id, reason }` for each failed charge.
  - Both arrays are **sorted by id**.
- **The order and concurrency of the `charge` calls are not part of the
  contract.** The next release makes them concurrent.

## Your task

Write a test file against the global `solution` (also available as
`subject`). The starter gives you `aSub` (a builder for a valid, due, monthly
subscription), `clockAt(iso)` and `fakeGateway()`, a fake `charge` that
records every request and lets you script a result per subscription.

- Write **at least 8 tests**, each with an assertion.
- The suite must pass against a rewrite that charges concurrently, in reverse
  order, and computes dates differently.
- Eight planted bugs must each fail at least one of your tests.

## The traps

- **The clock.** A bug that reads `Date.now()` agrees with you whenever your
  pinned clock and the real date give the same answer. Pin the clock years
  away from today, and include a subscription that is due by the real date
  but **not** by yours.
- **Call order.** Look requests up by `idempotencyKey` or `customerId`, or
  sort them, before you compare. `requests[0]` pins an order the next
  release will change.
- **Month ends.** A subscription renewing on the 10th tells you nothing about
  clamping. Use the 31st, and an annual plan on 29 February.
- **The whole result.** Assert `renewed` and `failed` with `toEqual`, so a
  missing or extra entry fails the test.
