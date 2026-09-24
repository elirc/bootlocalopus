Raw `fetch` is not shippable: it does not throw on 500, has no timeout,
no retries, and no consistent error type. Wrap it once, properly.

## Task

Export `createClient(options)` where options are
`{ baseUrl, fetch, timeoutMs = 1000, retries = 2, backoff = () => 0 }`.
It returns `{ get(path, opts), post(path, body, opts) }`.

Behaviour:

1. URLs are `baseUrl + path`.
2. A 2xx JSON response resolves to the parsed body. A 204 (or empty body)
   resolves to `null`.
3. A non-2xx response throws `HttpError` (also exported) with `status`,
   `body` (parsed if JSON, else text) and message ````GET /users failed with 500````.
4. Retry **only** 5xx responses and network errors — never 4xx. At most
   `retries` extra attempts, awaiting `backoff(retry)` before each one, where
   `retry` counts the retries: **1 before the first retry**, 2 before the
   second. (Not the 0-based loop index.)
5. Each attempt is bounded by `timeoutMs` using `AbortSignal`; a timeout is a
   retryable failure. Pass the signal to `fetch`.
6. A caller-supplied `opts.signal` cancels everything immediately, with no
   retry.
7. `post` sends `JSON.stringify(body)` with `content-type: application/json`.