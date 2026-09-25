The postmortem for last month's checkout outage took a week to write and
changed nothing. The timeline was pasted from three Slack channels, out of
order and with half the lines twice. Nobody could say how long it took to
notice the problem, which was the whole story: forty minutes. The summary
said the engineer "should have added a timeout", so the engineer spent the
review defending themselves instead of explaining what they saw. And the
action items were "be more careful with deploys" and "look into alerting",
with no owners.

A postmortem is how a team learns from an incident, and that only happens
when it is **accurate** (a clean timeline and honest numbers), **blameless**
(it asks what made the mistake easy, not who made it), and **ends in
owned, dated actions** that address how it happened *and* how long it took
to notice. Much of that can be checked by a tool before the review meeting.

## Your task

Implement `buildPostmortem(incident)`, returning `{ markdown, metrics, problems }`.

```js
{
  title: 'Checkout outage after pricing deploy',
  severity: 1,
  summary: 'A deploy added a call to the pricing service with no timeout. …',
  events: [                                 // in no particular order; may contain exact duplicates
    { at: '2024-05-01T14:05:00.000Z', kind: 'start', text: 'Deploy 4711 reaches 100%' },
    { at: '2024-05-01T14:17:00.000Z', kind: 'detected', text: 'Alert: checkout errors above 5%' },
    { at: '2024-05-01T14:10:00.000Z', kind: 'note', text: 'First customer ticket' },
    …
  ],
  actions: [
    { text: 'Add a 2 s timeout to the pricing client', owner: 'kim', due: '2024-05-10', type: 'prevent' },
    …                                        // owner and due can be null; type is prevent | detect | mitigate | process
  ],
}
```

### The timeline

Sort events by `at`, keeping input order for equal times, and drop **exact
duplicates** (same `at`, `kind` and `text`; keep the first). The **start
time** is the first `start` event's `at`, or, when there is no `start`
event, the earliest event's.

### `metrics`

`{ timeToDetectMin, timeToMitigateMin, timeToResolveMin }`: whole minutes
(rounded **down**) from the start time to the first `detected`, `mitigated`
and `resolved` event. `null` when that event is missing.

### `problems`

An array of `{ rule, detail }`, in this order:

1. `missing-event`, detail the kind, for each of `start`, `detected`,
   `mitigated`, `resolved` that does not appear.
2. `event-order`, detail the kind, for each of `detected`, `mitigated`,
   `resolved` whose first occurrence is **before** the first occurrence of
   the kind listed before it (for example `mitigated` before `detected`).
   Kinds that are missing are skipped: compare with the nearest earlier kind
   that exists.
3. `blame`, detail the phrase, for each of `human error`, `should have`,
   `failed to`, `careless`, `fault` found in the `summary` or any event
   `text`, as whole words, in any case (`faulty` is not `fault`). One problem
   per phrase, in this list's order.
4. For each action, in order: `action-missing-owner` then
   `action-missing-due`, detail the action's `text`.
5. `no-prevent-action` (detail `null`) when no action has type `prevent`.
6. `no-detect-action` (detail `null`) when `timeToDetectMin` is **more than
   10** and no action has type `detect`. If it took that long to notice, an
   action has to make noticing faster.

### `markdown`

```md
# Postmortem: Checkout outage after pricing deploy (SEV1)

## Summary

A deploy added a call to the pricing service with no timeout. …

## Impact

- Time to detect: 12 min
- Time to mitigate: 31 min
- Time to resolve: 1 h 5 min

## Timeline (UTC)

- 14:05 (+0 min) Deploy 4711 reaches 100%
- 14:10 (+5 min) First customer ticket
- 14:17 (+12 min) Alert: checkout errors above 5%

## Action items

| Type | Action | Owner | Due |
| --- | --- | --- | --- |
| prevent | Add a 2 s timeout to the pricing client | @kim | 2024-05-10 |
| detect | Page on checkout error rate above 2% for 3 minutes | (unassigned) | (none) |
```

- Sections are separated by one blank line, and the document ends with a
  single `\n`.
- Durations: whole minutes rounded down; `12 min` under an hour, then
  `1 h 5 min`, or `2 h` when the minutes are 0. A missing metric is
  `unknown`.
- Timeline lines are `- HH:MM (<offset>) <text>` with the UTC time. The
  offset from the start time is `+<duration>`, or `-<duration>` for an
  event before the start (the deploy that caused it, say).
- Action rows are ordered by type (`prevent`, `detect`, `mitigate`,
  `process`), keeping input order within a type. A `|` inside an action's
  text is written `\|` so it does not break the table.
- With no actions, the Action items section is the heading, a blank line and
  `None.` instead of a table.

## The traps

- **Sort, then dedupe, then measure.** The first `detected` event in the
  *input* is not necessarily the first in time.
- A timeline pasted from two channels has exact duplicates, and it also has
  two different events at the same minute. Only exact duplicates go; two
  different events at the same time both stay, in input order.
- `/fault/i` matches "faulty" and "default". Use word boundaries: `\b`.
