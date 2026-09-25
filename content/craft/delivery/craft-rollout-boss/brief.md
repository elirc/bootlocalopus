Every step of this chapter ends up in one place: the thing that actually
moves a release from 1 % of users to 100 %. Teams usually start with a
script: `set 1 %; sleep 10m; set 10 %; sleep 10m; …`. Then the incidents
arrive. The script kept ramping while the error rate climbed, because nobody
checked the health between sleeps. Someone paused it for lunch, and on
resume it jumped straight to the next stage, because the ten-minute bake
had "elapsed" while it was paused. The approval step before 100 % was
waiting for a human while the canary fell over, and nothing rolled it back
because "we're waiting for approval".

A rollout is a **state machine**, and the safe way to write one is as a
**pure reducer**: `(state, event) → { state, actions }`. It never reads the
clock (every event carries its time), never calls the flag service (it
returns actions for the caller to perform), and never mutates its input, so
every transition can be tested, logged and replayed.

## Your task

Export `createRollout(plan)` and `step(state, event)`.

**`createRollout(plan)`** validates the plan and returns the initial state.

```js
const plan = { stages: [1, 10, 50, 100], bakeMs: 600_000, approvalBefore: [100] };
```

`stages` must be a non-empty array of numbers, **strictly increasing**, each
greater than 0, and the **last must be 100**; `bakeMs` must be a number ≥ 0.
Otherwise throw a `RangeError`. `approvalBefore` is optional (default `[]`).
The initial state has `status: 'pending'` and `percent: 0`.

**The state** is a plain object you design. It must have `status` and
`percent` (the share of users currently on the new version); keep whatever
else you need in it (the plan, the stage index, when the stage started).
`step` must **not modify** the state it is given.

**`step(state, event)`** returns `{ state, actions }`. Events all have an
`at` (milliseconds). Actions are:

- `{ type: 'set-percent', percent }`: move the rollout to this percentage.
- `{ type: 'notify', event, reason? }`: tell a human.

| Status | Event | Result |
| --- | --- | --- |
| `pending` | `start` | `running` at `stages[0]`; the stage's bake starts now. Actions: `set-percent stages[0]`. |
| `running` | `tick` with `verdict: 'healthy'`, and the stage has baked (`at − stage start ≥ bakeMs`) | If this is the **last** stage: `complete`, actions `notify complete`. Else, if the **next** stage's percent is in `approvalBefore`: `awaiting-approval` (percent unchanged), actions `notify awaiting-approval`. Else: advance to the next stage, whose bake starts now; actions `set-percent <next>`. |
| `running` | any other `tick` that is not unhealthy (not baked yet, or `verdict: 'insufficient'`) | Nothing changes; no actions. |
| `awaiting-approval` | `approve` | `running` at the next stage, whose bake starts now. Actions: `set-percent <next>`. |
| `awaiting-approval` | a tick that is not unhealthy | Nothing changes; no actions. |
| `running` | `pause` | `paused`. |
| `paused` | `resume` | `running`, same stage, and its bake **starts again** at the resume. |
| `paused` | a tick that is not unhealthy | Nothing changes; no actions. |
| `running`, `paused` or `awaiting-approval` | `tick` with `verdict: 'unhealthy'` | `rolled-back`, `percent: 0`. Actions: `set-percent 0`, then `notify rolled-back` with `reason: 'unhealthy'`. |
| `running`, `paused` or `awaiting-approval` | `abort` | `rolled-back`, `percent: 0`. Actions: `set-percent 0`, then `notify rolled-back` with `reason: 'aborted'`. |

The `notify` actions are exactly `{ type: 'notify', event: 'complete' }`,
`{ type: 'notify', event: 'awaiting-approval' }` and
`{ type: 'notify', event: 'rolled-back', reason }`. Pause and resume return
no actions.

**Anything else** (a `tick` before `start`, `approve` while running,
`resume` while not paused, any event after `complete` or `rolled-back`, an
unknown event type) throws an `Error` whose message is exactly
`` `cannot ${event.type} while ${state.status}` ``. A caller that sends an
impossible event has a bug, and silently ignoring it hides the bug.

## The traps

- **Safety beats progress.** An unhealthy tick rolls back from `paused` and
  `awaiting-approval` too. "Waiting for a human" is not a reason to leave a
  broken canary serving users.
- **The bake timer restarts** at every advance, every approval and every
  resume. Time spent paused or waiting for approval is not bake time.
- **The last stage bakes too.** Reaching 100 % is not "complete"; staying
  healthy at 100 % for `bakeMs` is.
- **Do not mutate.** `{ ...state, status: 'paused' }`, never
  `state.status = 'paused'`. The tests keep old states and replay events
  from them.
