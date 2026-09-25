The business is migrating from an old card processor to a new one, and for a
few months both have to work. Their SDKs could hardly be more different, and
if checkout code talks to either directly, every `if (provider === 'legacy')`
spreads the old SDK's quirks — decimal strings, callbacks, errors that are not
`Error`s — through the codebase. An **adapter** wraps each SDK behind one
interface that *your* code chose, so checkout never learns which one it has.

## The interface you are adapting to

```js
gateway.charge({ amountCents, currency, token })
// resolves { status: 'paid', id, amountCents }
//       or { status: 'declined', id, reason }
// rejects  PaymentProviderError for outages and provider-side failures
```

A **decline is not an exception**: it is a normal business outcome the UI
shows ("your card was declined"), so it resolves. An outage rejects.

## The two SDKs

**Legacy** — callback style, decimal strings, lowercase currency:

```js
legacy.makePayment({ amount: '12.50', currency: 'gbp', cardToken }, (err, result) => { … })
// result: { ref: 'L-17', state: 'OK' | 'DECLINED', amount: '12.50' }
// err:    a plain object { code: 'TIMEOUT' | 'NETWORK' | 'INVALID_REQUEST' | … }
```

**Modern** — promises, integer minor units:

```js
await modern.charges.create({ amount_minor: 1250, currency: 'GBP', source: token })
// { id: 'ch_9', status: 'succeeded' | 'failed', failure_reason?: 'card_declined' | … }
// rejects with an Error carrying `statusCode` (e.g. 503, 400)
```

## Task

Export:

- `PaymentProviderError` — extends `Error`, `name` `'PaymentProviderError'`,
  with `provider` (`'legacy'` or `'modern'`), `retryable` (boolean) and
  `cause` (the SDK's original error value).
- `adaptLegacy(legacy)` and `adaptModern(modern)`, each returning
  `{ charge }` as above.

Mapping rules:

| | legacy | modern |
| --- | --- | --- |
| amount sent | `amountCents` as a decimal string with exactly two decimals (`5` → `'0.05'`, `1999` → `'19.99'`) | `amount_minor: amountCents` |
| currency sent | lowercase | uppercase |
| paid | `state: 'OK'`; `id` is `ref`; `amountCents` parsed from the **response's** `amount` | `status: 'succeeded'`; `amountCents` is what you sent |
| declined | `state: 'DECLINED'`; `reason: 'declined'` | `status: 'failed'`; `reason` is `failure_reason`, or `'declined'` if absent |
| error | `err` present → reject; `retryable` iff `code` is `'TIMEOUT'` or `'NETWORK'` | rejection → reject; `retryable` iff `statusCode` is missing or ≥ 500 |

Both adapters reject with a `TypeError` **without calling the SDK** when
`amountCents` is not a positive integer.

## The traps

- `parseFloat('0.29') * 100` is `28.999999999999996`. Converting the
  legacy response back to cents needs rounding, or better, string parsing.
- Going the other way, `(1999 / 100).toString()` is `'19.99'` but
  `(1990 / 100).toString()` is `'19.9'`. Build the string from integer parts.
- The legacy `err` is not an `Error`. Keep it as `cause` anyway — whoever
  debugs the outage will want the original.
