The webhook handler verified signatures, and its tests were green. They
built each payload with `JSON.stringify`, so every test body was compact
JSON. The payment provider sends **pretty-printed** JSON. The handler
checked the signature against `JSON.stringify(JSON.parse(body))`, so every
real webhook failed verification. The provider retried for three days and
then disabled the endpoint.

A webhook receiver is an integration point with rules you don't choose: the
provider signs the **raw bytes** it sends, it signs a **timestamp** so old
requests can't be replayed, it delivers **at least once** (so duplicates
arrive), and it **retries** anything that isn't a `2xx`. Each rule is a way
for the receiver to be wrong.

## The API under test

`createApp({ secret, onEvent, now })` returns an unstarted `http.Server`.
`onEvent(event)` is your fake handler (it may be async, and it may throw).
`now()` returns the time in **milliseconds**.

`POST /webhooks` with a JSON body `{ id, type, … }` and the header

```
X-Signature: t=<unix time in seconds>,v1=<hex HMAC-SHA256>
```

where the HMAC is computed with `secret` over the string
`` `${t}.${rawBody}` ``, the timestamp, a dot, and the body **exactly as
sent**.

| situation | answer |
| --- | --- |
| missing, malformed or wrong signature | `401` `INVALID_SIGNATURE`, `onEvent` not called |
| `t` more than **300 s** away from `now()`, in the **past or the future** (exactly 300 s is fine) | `401` `STALE_SIGNATURE`, not called |
| valid, new event id | calls `onEvent(event)` once, then `200` `{ received: true }` |
| valid, an event id already **handled successfully** | `200`, `onEvent` **not** called again |
| `onEvent` throws | `500` `HANDLER_FAILED`. The event is **not** marked handled, so the provider's retry is processed |

## Your task

Write a test file that uses `describe` / `it` / `expect` and `fetch` against
the global `solution` (also available as `subject`). You can import from
`node:crypto` to sign requests. The starter has `sign()` and a `withApp`
that closes the server in a `finally`.

- Write **at least 7 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** but parses
  the header differently and rewords its responses. Assert on status,
  `error.code` and what `onEvent` received.
- Seven planted bugs must each make at least one of your tests fail.

## The trap

If every test body comes from `JSON.stringify(obj)`, you are testing the
compact form only. Send at least one body with whitespace in it, signed
**as sent**. And the timestamp: a signature computed at one time, sent with
a **different** `t` in the header, must fail. Otherwise an attacker can
replay an old request with a fresh timestamp.
