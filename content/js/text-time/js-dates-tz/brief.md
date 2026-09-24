"Remind me at the same time tomorrow" implemented as `+ 24 * 60 * 60 * 1000`
is right 363 days a year. On the night the clocks change it fires an hour early
or an hour late, and nobody notices until the support tickets arrive. "Start of
today" computed with `setHours(0)` uses the **server's** zone, not the user's.
`date.setMonth(date.getMonth() + 1)` on 31 January gives you 3 March. And
`(cents / 100).toFixed(2)` prints `¥1500.00` for a price that has no decimals
at all.

Node 24 ships full ICU, so `Intl` knows every zone's DST rules and every
currency's minor unit. You do not need a date library for any of this — you
need to stop doing arithmetic on wall-clock time.

## Task

Export five functions. None of them may depend on the machine's own time zone
(the grader's machine is not in UTC).

### `startOfDayInZone(date, timeZone)` → `Date`

The instant at which the calendar day containing `date`, **as seen in
`timeZone`**, began (local midnight). For example the London day containing
`2025-10-26T12:00:00Z` began at `2025-10-25T23:00:00.000Z`, because at midnight
that morning London was still on BST (UTC+1). Do not mutate `date`.

### `sameTimeTomorrow(date, timeZone)` → `Date`

The instant with the same wall-clock time (to the millisecond) on the next
calendar day in `timeZone`. Across a DST change that is 23 or 25 hours later,
not 24. Two edge cases, with the policy fixed (it is the one Temporal calls
`"compatible"`):

- the wall time **does not exist** tomorrow (it falls in the spring-forward
  gap, e.g. 02:30 in New York on 9 March 2025) → move it forward by the length
  of the gap (03:30 EDT);
- the wall time **happens twice** tomorrow (the autumn fall-back hour, e.g.
  01:30 in New York on 2 November 2025) → take the **earlier** one (01:30 EDT).

### `addMonths(isoDate, n)` → `string`

`isoDate` is a calendar date `'YYYY-MM-DD'`; `n` is an integer (may be negative
or zero). Return the same day-of-month `n` months later, **clamped to the last
day of the target month**:

| input | n | result |
| --- | --- | --- |
| `'2025-01-31'` | 1 | `'2025-02-28'` |
| `'2024-01-31'` | 1 | `'2024-02-29'` |
| `'2025-01-31'` | 2 | `'2025-03-31'` |
| `'2025-03-31'` | -1 | `'2025-02-28'` |

Note that clamping is not reversible: `addMonths(addMonths('2025-01-31', 1), 1)`
is `'2025-03-28'`. That is why a monthly billing schedule adds `k` months to the
**anchor** date instead of one month to the previous bill.

Throw a `RangeError` for anything that is not a real `YYYY-MM-DD` date
(`'2025-02-30'`, `'2025-1-5'`, `'yesterday'`).

### `parseInstant(text)` → `Date`

Parse an ISO-8601 date-time that **carries an explicit offset** — `Z` or
`±HH:MM` — such as `'2025-03-30T12:00:00+01:00'` or
`'2025-03-30T11:00:00.250Z'`. Seconds and fractional seconds are optional.
The result's `toISOString()` is the UTC form, so a UTC string round-trips
exactly.

Throw a `RangeError` for:

- no offset (`'2025-03-30T12:00:00'`) — `new Date()` would silently read that
  as the *machine's* local time, which is the bug this function exists to stop;
- a date only (`'2025-03-30'`), or anything that is not a date-time;
- a date-time that does not exist (`'2025-02-30T10:00:00Z'`) — `new Date()`
  quietly rolls it into March.

### `formatPrice(minor, currency, locale)` → `string`

`minor` is an integer amount in the currency's **minor unit** (cents for USD,
yen for JPY, which has no minor unit, fils for KWD, which has three decimals).
Return exactly what `Intl.NumberFormat` produces for that amount with
`style: 'currency'`, e.g.

- `formatPrice(1999, 'USD', 'en-US')` → `'$19.99'`
- `formatPrice(1999, 'EUR', 'de-DE')` → `'19,99 €'` (the space is U+00A0)
- `formatPrice(1500, 'JPY', 'en-US')` → `'¥1,500'`
- `formatPrice(1234, 'KWD', 'en-US')` → `'KWD 1.234'`

Do not hard-code "divide by 100": ask `Intl` how many fraction digits the
currency has. Throw a `RangeError` if `minor` is not a safe integer.
