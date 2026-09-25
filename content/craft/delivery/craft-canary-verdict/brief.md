The deploy tool promoted a canary after two minutes because "0 errors". The
canary had served 14 requests. Twenty minutes after going to 100 %, the error
rate was 4 %. The week before, the same tool rolled back a perfectly good
release, because it compared the canary with **yesterday's** error rate, and
today a payment provider was having a bad afternoon that hit every server
equally.

A canary verdict has to answer one question: **is the new version worse
than the old version, right now, on the same traffic?** That means comparing
against the baseline fleet over the same window, refusing to decide on too
little data, requiring the canary to stay healthy for several windows in a
row before promoting, and still pulling the plug straight away when it is
obviously broken.

## Your task

Implement `judgeCanary(checks, policy)`.

`checks` is the history of this canary, **oldest first**. Each check covers
one time window and measures both fleets over that same window:

```js
{
  baseline: { requests: 12000, errors: 18, p99Ms: 240 },
  canary:   { requests: 1300,  errors: 3,  p99Ms: 251 },
}
```

`policy` is:

```js
{
  minRequests: 500,             // both fleets need this many requests in a window to judge it
  maxErrorRateIncrease: 0.01,   // canary rate minus baseline rate, as a fraction (0.01 = 1 point)
  maxLatencyRatio: 1.25,        // canary p99 may be up to 1.25 × baseline p99
  abortAfterErrors: 50,         // this many canary errors in one window is a rollback, whatever the traffic
  healthyChecks: 3,             // consecutive healthy windows needed to promote
}
```

**Judge each window.** The error rate is `errors / requests`.

1. If `canary.errors >= abortAfterErrors`, the window is **unhealthy** with
   reasons `['error-rate']`. No sample-size check: fifty errors is enough
   evidence.
2. Otherwise, if either fleet has fewer than `minRequests` requests, the
   window is **insufficient**.
3. Otherwise collect reasons, in this order:
   - `'error-rate'` if canary rate − baseline rate **>** `maxErrorRateIncrease`;
   - `'latency'` if canary p99 **>** baseline p99 × `maxLatencyRatio`.

   With reasons, the window is **unhealthy**; without, it is **healthy**.
   Exactly at a limit is healthy.

**Then decide**, returning `{ verdict, reasons }`:

- The **latest** window is unhealthy: `{ verdict: 'rollback', reasons }`,
  with that window's reasons.
- Otherwise, the last `healthyChecks` windows (at least that many must exist)
  are **all healthy**: `{ verdict: 'promote', reasons: [] }`. An
  insufficient window breaks the streak just like an unhealthy one.
- Otherwise: `{ verdict: 'wait', reasons: [] }`. No checks at all is `wait`.

## The traps

- **Compare rates, not counts.** The canary gets a tenth of the traffic, so
  it has a tenth of the errors when it is exactly as good.
- **Compare with the baseline, as a difference.** A ratio of rates explodes
  when the baseline has zero errors: one canary error is "infinitely worse".
- **No data is not good data.** A window with 14 requests is not healthy; it
  is insufficient, and it does not count towards the streak.
