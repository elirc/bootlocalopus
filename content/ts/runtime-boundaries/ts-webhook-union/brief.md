A payment provider POSTs events to your webhook: `payment.succeeded`,
`payment.failed`, `refund.created`, and next month something new that nobody
told you about. The handler usually does `const event = req.body as
WebhookEvent` and switches on `event.type`. That breaks in two opposite ways:

- **Too trusting.** `amount: "1250"` flows into your ledger as a string, and
  `"1250" + 100` is `"1250100"`.
- **Too strict.** The handler throws on the new event type, answers 500, and
  the provider retries it with backoff for three days, filling your error
  tracker with the same event and delaying the ones behind it.

The right parser is **strict about the events it knows and tolerant of the
ones it does not**. It returns a discriminated union, so everything after the
boundary can `switch` on it exhaustively.

This lesson has **runtime** tests.

## Task

**`parseWebhook(body: unknown): WebhookResult`**, with the types in the
starter. A delivery looks like:

```json
{ "id": "evt_1", "type": "payment.succeeded", "created": 1767225600, "data": { … } }
```

1. `body` must be a non-array object, otherwise errors are
   `['body: expected an object']`.
2. The **envelope**: `id` and `type` are non-empty strings, and `created` is a
   positive integer (Unix **seconds**). Collect every envelope error in the
   order `id`, `type`, `created`. If there are any, return only those.
   `createdAt` is `new Date(created * 1000)`.
3. An **unknown `type`** (including names like `toString`) is **not an
   error**: return `{ type: 'unknown', id, createdAt, originalType }`, and do
   not look at `data`.
4. For a known type, `data` must be a non-array object
   (`'data: expected an object'`), then its fields are checked **in this
   order**, collecting every error:

| type | `data` field | rule | event field |
| --- | --- | --- | --- |
| `payment.succeeded` | `payment_id` | non-empty string | `paymentId` |
| | `amount` | integer ≥ 0 | `amountCents` |
| | `currency` | `'gbp'`, `'eur'` or `'usd'` | `currency`, **uppercased** |
| `payment.failed` | `payment_id` | non-empty string | `paymentId` |
| | `failure_reason` | a string or `null` (must be present) | `reason`; `null` → `'unknown'` |
| `refund.created` | `refund_id` | non-empty string | `refundId` |
| | `payment_id` | non-empty string | `paymentId` |
| | `amount` | integer ≥ 1 | `amountCents` |

Errors are `'<path>: <reason>'`, paths are `id`, `type`, `created` or
`data.<field>`, and the reasons are exactly `expected a non-empty string`,
`expected a positive integer` (for `created`, and for amounts ≥ 1),
`expected a non-negative integer` (amounts ≥ 0),
`expected one of gbp, eur, usd` and `expected a string or null`.

The event has **exactly** the fields in the union: build it from the checked
values, never by spreading the input.

**`describeEvent(event: WebhookEvent): string`**, using a `switch` on `type`
with a `never` check in the `default` branch (amounts in major units, 2
decimals):

- `Payment pay_1 succeeded: 12.50 GBP`
- `Payment pay_2 failed: card_declined`
- `Refund re_1 for pay_1: 5.00`
- `Ignored customer.updated`
