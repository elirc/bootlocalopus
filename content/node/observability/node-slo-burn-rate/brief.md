"Alert when the error rate goes above 1%" pages someone at 3 a.m. for a
two-minute blip that fixed itself, and stays silent for a slow 0.5% leak that
eats the whole month's reliability. **SLO-based alerting** asks a better
question: *at the current rate, how fast are we spending our error budget?*

- An **SLO** of 99.9% availability over 30 days gives an **error budget** of
  0.1% of requests.
- The **burn rate** over a window is the error ratio in that window divided
  by the budget. Burn rate 1 spends the budget exactly over 30 days; burn
  rate 14.4 spends 2% of it in an hour.
- Google's SRE workbook pages on a **fast burn** (≥ 14.4 over the last hour
  *and* the last 5 minutes) and opens a ticket on a **slow burn** (≥ 6 over
  6 hours *and* 30 minutes). The long window proves it is significant; the
  short one proves it is **still happening**, so the alert resets soon after
  the problem stops.

Two traps. The error ratio of a window is **total errors / total requests**
— averaging per-minute ratios gives a quiet 3 a.m. minute (2 requests, 1
error: 50%) as much weight as a busy noon minute. And a window with no
traffic has an error ratio of 0, not `NaN`.

## Task

Export `evaluateSlo({ objective, windowMs = 30 * 24 * 60 * 60 * 1000 }, buckets, now)`.

- `objective` must be a number strictly between 0 and 1, else throw a
  `RangeError`.
- `buckets` is an array of `{ start, total, errors }` (`start` in ms; `total`
  and `errors` integers with `0 <= errors <= total`, else `RangeError`), in
  any order.
- A bucket belongs to a window of length `w` when
  `now - w <= start < now` (buckets at or after `now` are in no window).
- `errorRatio(w)` = the sum of `errors` over the sum of `total` of the
  buckets in the window, or `0` if that total is `0`.
- `budget = 1 - objective`.

Return:

```js
{
  sli,                    // 1 - errorRatio(windowMs)
  budgetRemaining,        // 1 - errorRatio(windowMs) / budget   (negative once overspent)
  burnRates: {            // errorRatio(w) / budget
    '5m': …, '30m': …, '1h': …, '6h': …,
  },
  alert,                  // 'page' | 'ticket' | null
}
```

`alert` is `'page'` when `burnRates['1h'] >= 14.4` and `burnRates['5m'] >= 14.4`;
otherwise `'ticket'` when `burnRates['6h'] >= 6` and `burnRates['30m'] >= 6`;
otherwise `null`.
