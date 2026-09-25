Every job scheduler starts with a bag of optionals:

```ts
{ name: string; at?: Date; everyMs?: number; cron?: string; timezone?: string; … }
```

It type-checks `{ at, cron }` (which one runs?), `{ everyMs, timezone }`
(timezone of what?) and `{ name }` with no trigger at all, which schedules a
job that never runs. The runtime has to guess or throw, and the caller gets a
handle whose type is `OneShotHandle | RecurringHandle`, so every call site
narrows by hand.

A TypeScript API can refuse all of that at compile time. The two tools are a
**union of option shapes** and **`never` for keys that must be absent**.

## Task

The handle interfaces and the runtime body of `schedule` are given and
correct. Write the types (the spec imports all of these):

| export | meaning |
| --- | --- |
| `ExactlyOne<T>` | exactly one of `T`'s keys is present, with its type from `T`. `ExactlyOne<{ email: string; phone: string }>` accepts `{ email }` or `{ phone }`, rejects `{}` and `{ email, phone }` |
| `OnceOptions` | `name`, `retry?`, and `at: Date` |
| `IntervalOptions` | `name`, `retry?`, `everyMs: number`, `jitterMs?: number` |
| `CronOptions` | `name`, `retry?`, `cron: string`, `timezone?: string`, `jitterMs?: number` |
| `ScheduleOptions` | any one of the three |
| `schedule(job, options)` | returns `OneShotHandle` for `at`, `RecurringHandle` for `everyMs`/`cron`, and `OneShotHandle \| RecurringHandle` when given an un-narrowed `ScheduleOptions` |

`retry` is `false` or a complete `RetryPolicy` (`{ attempts, delayMs }`, both
required) — not `true`, not half a policy. `name` is always required.

The spec checks that each of these is a **compile error**:

- two triggers (`at` + `cron`, `everyMs` + `cron`, …) or none;
- two triggers in an object built earlier and passed as a variable (no
  excess-property check to save you there);
- `timezone` anywhere but cron; `jitterMs` on a one-shot;
- `once.stop()` and `every.cancel()`.

## The traps

- A plain union `{ at: Date } | { cron: string }` **accepts** `{ at, cron }`:
  the value matches the first member, and extra properties are allowed
  (excess-property checks on unions are lenient, and do not happen at all
  for a variable). Each member must say the other triggers are
  `?: never`.
- `ExactlyOne` is the same idea as a generic: map each key `K` to
  `Pick<T, K>` plus every *other* key as `?: never`, then index the mapped
  type with `[keyof T]` to get the union.
- For the return type, overloads (one per shape, plus one for the whole
  union) or a generic with a conditional return both work. The runtime
  implementation signature stays as it is.
