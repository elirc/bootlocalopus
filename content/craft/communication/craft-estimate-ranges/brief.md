"How long will it take?" "About six days." Six days is the sum of the
**most likely** time of each task, and it is the one number that is almost
guaranteed to be wrong: task times are skewed (a task can take three times
longer than expected, but never three times shorter), so the likely times add
up to something you will beat perhaps one time in five. The engineer who
knows this and pads to "fifteen days, to be safe" (the sum of every worst
case) is also wrong, just in the other direction: all the worst cases do not
happen at once.

The honest answer is a **range with a confidence**: "most likely about 7½
days; 85 % confident within 8½; 95 % within 9." Product can plan with that.
And the tasks that make the range wide are the ones to **spike** (a short,
time-boxed investigation) before committing.

## Your task

Implement `estimate(tasks)`. Each task is
`{ name, best, likely, worst }`, in days. Use the classic three-point
(PERT) approximation:

- Per task: `mean = (best + 4 × likely + worst) / 6` and
  `sd = (worst − best) / 6`.
- For the project: `mean` is the **sum** of the task means, and `sd` is
  the **square root of the sum of the squared** task `sd`s (variances add;
  standard deviations do not).

Return:

```js
{
  expectedDays: 7.5,  // roundUp(mean)
  p85Days: 8.5,       // roundUp(mean + 1.04 × sd)
  p95Days: 9,         // roundUp(mean + 1.645 × sd)
  spikes: ['payment provider webhook'],
  summary: 'Most likely about 7.5 days; 85% confident within 8.5 days, 95% within 9. Spike first: payment provider webhook.',
}
```

- `roundUp` rounds **up to the next half day**, leaving a value that is
  already on a half day alone. Floating point sums are slightly off
  (`7.000000000000001`), so use exactly
  `const roundUp = (x) => Math.ceil(x * 2 - 1e-9) / 2;`.
- `spikes` lists the names of tasks whose `worst` is **more than three
  times** their `likely`, in input order.
- `summary` is exactly
  `` `Most likely about ${expectedDays} days; 85% confident within ${p85Days} days, 95% within ${p95Days}.` ``
  followed, only when there are spikes, by
  `` ` Spike first: ${spikes.join(', ')}.` `` Numbers are printed as
  JavaScript prints them (`7.5`, `9`).
- Throw a `RangeError` for an empty list, or for any task where the three
  values are not numbers with `0 <= best <= likely <= worst`. An estimate
  built on `worst < likely` is a typo, and a typo should not reach a
  roadmap.

## The traps

- **Do not add standard deviations.** Adding them is the same mistake as
  adding worst cases: it assumes every task goes badly together.
- The expected value is **not** the sum of the likely values. For skewed
  tasks it is always higher, and that gap is where "it took twice as long as
  we said" comes from.
