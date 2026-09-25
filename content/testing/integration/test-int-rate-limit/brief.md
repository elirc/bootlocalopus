A partner's integration breaks every day at the same time. Their client
honours `Retry-After`, and the server sends `Retry-After: 42000`: the value
was in milliseconds, so the client waits eleven hours. Another team's
rate limiter shared one counter across every API key, so a single noisy
customer got everyone else a `429`. Both limiters had a test: "the sixth
request is rejected". They were tested with one key, one window and no
clock.

A rate limiter is state that changes over **time** and **per client**. To
test it through HTTP you control the clock (inject `now`), and you use more
than one key.

## The API under test

`createApp({ now, limit = 5, windowMs = 60000 })` returns an unstarted
`http.Server`. `now()` returns the current time in milliseconds. Pass your
own clock, such as `let t = 0; const now = () => t;`, and move `t` between
requests.

- `GET /search?q=…` needs an **`X-Api-Key`** header. Without it: `401`
  `UNAUTHORIZED`.
- Each key gets `limit` requests per **fixed window** of `windowMs`. The
  window starts at that key's **first** request. At `start + windowMs`
  **exactly**, a new window begins and the count starts again.
- Keys are limited **independently**.
- A request within the limit answers `200` with **`RateLimit-Limit`** (the
  limit) and **`RateLimit-Remaining`** (how many are left **after** this
  one: `4` after the first of 5).
- Over the limit: `429` `RATE_LIMITED`, with **`Retry-After`** in whole
  **seconds** until the window ends, rounded **up**, and
  `RateLimit-Remaining: 0`. Rejected requests are not counted.
- `GET /health` is never limited and needs no key.

## Your task

Write a test file that uses `describe` / `it` / `expect` and `fetch` against
the global `solution` (also available as `subject`). The starter's
`withApp` starts the server on port `0` and **closes it in a `finally`**.

- Write **at least 6 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same**. It stores
  the reset time instead of the start, counts down instead of up, and
  sends header names in a different case. Read headers with
  `headers.get()`, which ignores case.
- Seven planted bugs must each make at least one of your tests fail.

## The trap

No `setTimeout`, and no real waiting. The window is 60 seconds, and a test
that sleeps for it is useless. Move the fake clock. Test the reset at the
**exact** millisecond the window ends, and one millisecond before it. For
`Retry-After`, choose a time where seconds and milliseconds give different
numbers, and where rounding up and rounding down differ.
