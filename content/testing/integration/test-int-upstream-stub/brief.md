The exchange-rates client was unit-tested with `fetch` mocked:
`mockFetch.mockResolvedValue({ ok: true, json: () => ({ rate: 0.9 }) })`.
Everything passed. In production the provider rate-limited us with `429`
and `Retry-After: 30`, and the client retried every 100 ms, which got the
API key suspended. It also retried a `401` three times on every call,
and it returned the string `"0.91"` when the provider changed a field type.
The mock only ever answered what the test author imagined.

A **stub server** is a real HTTP server in your test that plays the
provider. The client makes real requests, with real headers, status codes
and bodies, and your test decides what each response is and records what
the client sent.

## The client under test

`createRatesClient({ baseUrl, apiKey, maxAttempts = 3, sleep })` returns
`{ getRate(from, to) }`. `sleep(ms)` is injected: pass one that records the
delay and resolves at once.

`getRate('USD', 'EUR')` sends `GET <baseUrl>/rates?from=USD&to=EUR` with the
header `Authorization: Bearer <apiKey>`.

| provider answers | the client |
| --- | --- |
| `200` `{ rate: <finite number> }` | resolves to the rate |
| `200` where `rate` is **not a finite number** (a string, `null`, missing) | rejects with `UpstreamError`, `status: 200`, `retryable: false` |
| `404` | resolves to **`null`** (unknown pair), no retry |
| any other `4xx` | rejects with `UpstreamError`, that `status`, `retryable: false`, **no retry** |
| `429` or `5xx` | **retries**, up to `maxAttempts` requests in total. Then rejects with `UpstreamError`, the last `status`, `retryable: true` |

Between attempts it calls `sleep` once:

- on a `429` with a positive `Retry-After` header (seconds): that many
  seconds, in **milliseconds** (`Retry-After: 30` → `sleep(30000)`);
- otherwise exponential backoff: `100`, `200`, `400`, …
- **never** after the last attempt.

`UpstreamError` is exported as `solution.UpstreamError`.

## Your task

Write a test file that uses `describe` / `it` / `expect` against the global
`solution` (also available as `subject`). The starter's `withStub` starts a
stub server on port `0` that answers with whatever your `respond` function
returns, records every request, and **closes in a `finally`**.

- Write **at least 7 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** but builds
  the URL by hand and rewords errors. Assert on the error's class, `status`
  and `retryable`, and read the query with `URLSearchParams`, not by
  comparing the raw URL string.
- Seven planted bugs must each make at least one of your tests fail.

## The trap

For retries, the **number of requests the stub received** and the **delays
passed to `sleep`** are the behaviour. Script the stub to fail a set number
of times, for example `503, 503, 200`, and assert both lists. A stub that
always answers `200` tests only the one path that never goes wrong.
