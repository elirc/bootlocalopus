A mobile client pays for an order. The response is lost in a tunnel, so the
client retries, and the customer is charged twice. The fix is an
**`Idempotency-Key`** header. The client sends the same key on every retry,
and the server answers a repeat with the stored result instead of charging
again. The endpoint that implemented it had one test: "two requests with
the same key charge once". It passed. It also passed when a failed charge
locked the key forever, when a changed amount replayed the old payment,
and when two simultaneous retries both went through.

Idempotency is about **sequences** and **timing**. You test it by sending
the same request more than once, in the right order, and checking what
reached the payment provider.

## The API under test

`createApp({ charge })` returns an unstarted `http.Server`.
`charge({ customerId, amountCents })` is the payment provider. You supply it,
and it must resolve to `{ chargeId }` or reject.

`POST /payments` with a JSON body `{ customerId, amountCents }`:

1. No `Idempotency-Key` header: `400` `IDEMPOTENCY_KEY_REQUIRED`, and
   `charge` is not called.
2. An invalid body (`customerId` not a string, `amountCents` not a
   positive whole number): `400` `VALIDATION`. Nothing is stored, so the
   same key can be used again with a fixed body.
3. A **new key**: calls `charge` once and answers `201`
   `{ id, customerId, amountCents, chargeId }`. `id` is an opaque string.
4. The **same key and the same body** again: answers with the stored
   status (`201`) and the **identical** body, plus the header
   `Idempotent-Replayed: true`. **`charge` is not called again.** The body
   counts as the same when it is the same JSON value, so key order doesn't
   matter.
5. The **same key with a different body**: `422`
   `IDEMPOTENCY_KEY_REUSED`.
6. The same key while the first request is **still waiting on `charge`**:
   `409` `IDEMPOTENCY_KEY_IN_USE`.
7. If `charge` rejects: `502` `PAYMENT_FAILED`, and **the key is
   released**, so a retry with the same key calls `charge` again.

Errors use `{ error: { code, message } }`. Only `code` is the contract.

## Your task

Write a test file that uses `describe` / `it` / `expect` and `fetch` against
the global `solution` (also available as `subject`). Start every server on
port `0` and **close it in a `finally`**. The starter's `withApp` does both.

- Write **at least 7 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** but
  generates random payment ids, orders JSON keys differently and rewords
  messages. So compare a replay with the first response, not with a
  hardcoded id.
- Seven planted bugs must each make at least one of your tests fail.

## The trap

Count the calls to `charge`. The status code alone won't tell you whether
the customer was charged twice. For rule 6 you need a `charge` that doesn't
settle until you say so. Start the first request, **wait until `charge` has
been called**, send the second, then settle the first.
