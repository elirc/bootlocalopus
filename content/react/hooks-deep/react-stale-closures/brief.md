Every function a component creates closes over **that render's** props and
state. Most of the time that is fine, because the next render makes new
functions. It goes wrong when a function outlives its render: a subscription
callback registered in `useEffect(..., [])`, or three `setX(x + 1)` calls in
one handler, all reading the same `x`.

The starter is a live payments widget with four closure bugs:

1. The feed handler does `setTotal(total + amount)`. It was created on the
   first render, so `total` is `0` forever: the total shows only the latest
   payment.
2. The "Add 3 test payments" button calls `setCount(count + 1)` three times;
   all three read the same `count`.
3. The over-limit check reads `limit` from the first render, so raising the
   limit has no effect.
4. It calls the first render's `onOverLimit`, not the latest.

The tempting fix, adding everything to the dependency array, "works" by
unsubscribing and resubscribing on every payment. With a real socket that
means dropped messages and reconnect storms. Subscribe **once per feed**.

## Task

Fix `LiveTotals({ feed, limit, onOverLimit })`. `feed.subscribe(handler)`
returns an unsubscribe function and calls `handler({ amount })` per payment.

- `<p data-testid="total">Total: {total}</p>` and
  `<p data-testid="count">Count: {count}</p>`, both starting at 0
- every payment adds its `amount` to the total and 1 to the count — including
  several payments delivered in the same tick
- the button `Add 3 test payments` adds three payments of amount `1`
- when `total > limit`, render `<p role="alert">Over limit</p>`, using the
  **current** `limit` prop
- call `onOverLimit(total)` once each time the total **goes from not-over to
  over** the limit (not on every payment while over). Call the latest
  `onOverLimit` prop.
- subscribe exactly once per `feed` (resubscribe only if the `feed` prop
  changes) and unsubscribe on unmount
