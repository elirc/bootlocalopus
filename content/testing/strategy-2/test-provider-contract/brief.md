The backend team changed `placedAt` from an ISO string to epoch milliseconds,
because "a number is easier to sort". Their tests were updated in the same PR
and went green. The Android app parsed the number as a date string and showed
every order as placed on 1 January 1970. The provider's tests checked what the
provider *did*. Nothing checked what its consumers *needed*.

A **provider contract test** is that check. It pins the parts of the response
that consumers read (names, types, formats, `null` versus missing) and
deliberately **ignores everything else**, so the provider can still add
fields, reorder keys and change values without a red build. A test that
`toEqual`s the whole body fails on every harmless addition, and a team that
gets told "the contract broke" every week stops listening.

## The consumers' needs

`toOrderDto(order)` builds the JSON body of `GET /orders/:id`. The mobile app
and the email service read:

- `id` (string), `currency` (string), and `status`, exactly one of
  `'pending'`, `'paid'`, `'shipped'`, `'cancelled'`, in lower case.
- `totalCents`: an **integer number** of cents.
- `placedAt`: an ISO 8601 **UTC** string with milliseconds, exactly what
  `Date#toISOString()` produces (`'2024-05-01T09:30:00.000Z'`).
- `customer.id` and `customer.name`, nested under `customer`.
- `discountCode`: a string, or **`null`** when there is none. The key is
  always present: the app does `body.discountCode === null`.
- `lines`: always an array, **`[]` for an order with no lines**, each line with
  `sku`, `qty` and `unitCents`.

An order row passed to it looks like:

```js
{
  id: 'ord_7', status: 'paid', totalCents: 12990, currency: 'GBP',
  placedAt: new Date('2024-05-01T09:30:00.000Z'),
  customer: { id: 'cus_1', name: 'Kim Lee' },
  discountCode: null,             // or 'SPRING10'
  lines: [{ sku: 'TEE', qty: 3, unitCents: 4330 }],
}
```

## Your task

Write a test file against the global `solution` (also available as
`subject`).

- Write **at least 6 tests**, each with an assertion.
- The suite must pass against **the next release**, which adds new fields
  (`itemCount`, `links`, `customer.tier`, `lines[].lineTotalCents`) and
  reorders every key. Those are additive changes and must not fail a contract.
- Eight planted breaking changes must each fail at least one of your tests.

## The trap

Consumers read JSON, not your JavaScript object. Check the body **after**
`JSON.parse(JSON.stringify(dto))`: a key set to `undefined` is present in the
object and gone from the wire. Use `toMatchObject` (extra keys allowed) or
check fields one by one, never `toEqual` on the whole body. And test the
awkward orders too, not just the full one: no discount, no lines.
