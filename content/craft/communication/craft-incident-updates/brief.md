During an incident, the engineers fixing it are not the only people
waiting. Support is answering angry customers, account managers are fielding
calls, and leadership wants to know whether to tell the board. The update
they get is often "still looking into it 👀" at an unpredictable time, or
nothing for ninety minutes because everyone was heads down. So they ping the
incident channel, and the people fixing it spend their time answering pings.

A good incident update is boring and predictable: **what is broken for
customers, since when, whether there is a workaround, and when the next
update will come**, and the next update then comes on time, even if it says
"no change". Most incident tools generate it from a template. You will write
the template.

## Your task

Implement `composeUpdate(incident, now)`. `now` is milliseconds since the
epoch. The incident is:

```js
{
  title: 'Card payments failing',
  severity: 1,                    // 1, 2 or 3
  status: 'investigating',        // 'investigating' | 'identified' | 'monitoring' | 'resolved'
  impact: 'About 20% of card payments at checkout fail. PayPal is unaffected.',
  workaround: 'Customers can pay with PayPal.', // or null
  startedAt: '2024-05-01T14:05:00.000Z',
  resolvedAt: null,               // ISO string once resolved
}
```

Return `{ text, nextUpdateAt }`. `text` is these lines joined with `\n`:

```
[SEV1] Investigating: Card payments failing
Impact: About 20% of card payments at checkout fail. PayPal is unaffected.
Started: 14:05 UTC (47 min ago)
Workaround: Customers can pay with PayPal.
Next update: by 15:25 UTC
```

**While not resolved:**

1. `[SEV<severity>] <Status>: <title>`, where `<Status>` is the status with
   a capital first letter.
2. `Impact: <impact>`
3. `Started: <time> (<duration> ago)`, the duration from `startedAt` to
   `now`.
4. `Workaround: <workaround>`, only when it is not `null`.
5. `Next update: by <time>`.

`nextUpdateAt` is `now` plus the cadence (**30 minutes** for SEV1, **60** for
SEV2, **120** for SEV3), **rounded up to the next whole 5 minutes** (a time
already exactly on a 5-minute mark, with zero seconds and milliseconds, stays
as it is). Return it as an ISO string (`toISOString()`), and use the same
instant in the text.

**When resolved:**

1. `[SEV<severity>] Resolved: <title>`
2. `Impact: <impact>`
3. `Started: <time>, resolved <time> (lasted <duration>)`, the duration from
   `startedAt` to `resolvedAt`.

No workaround line, no next update, and `nextUpdateAt` is `null`.

**Times** are UTC, `HH:MM UTC`, zero-padded. A time whose **UTC date differs
from `now`'s UTC date** is written with its date: `2024-04-30 23:50 UTC`.
Nobody should read "Started: 23:50" at 00:30 and think it began a minute ago.

**Durations** count whole minutes, rounding **down**: under an hour it is
`47 min`; from an hour, `1 h 12 min`, or just `2 h` when the minutes are 0.

**Impact is required.** If `impact` is missing or blank, throw an `Error`
whose message is `impact is required`. An update that does not say what
customers are experiencing is not an update.

## The traps

- Round the next update **up**. Promising 15:22 and posting at 15:25 is
  late; promising 15:25 and posting at 15:22 is early.
- `new Date(ms).getHours()` is the **server's** time zone. Use the
  `getUTC…` methods, or slice `toISOString()`.
