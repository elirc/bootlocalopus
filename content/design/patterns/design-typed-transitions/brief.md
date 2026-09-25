The ticket machine in the previous lesson rejects an illegal event at
runtime. For a WebSocket connection in a front-end, "at runtime" means a user
on a train hits the bug. If the transition table is also a **type**, the
compiler rejects `send(idleConnection, { type: 'OPENED' })` before it ships, and
tells you precisely what state you get back.

## Task

The state and event unions and the runtime body of `send` are given and
correct. Write the types:

| export | meaning |
| --- | --- |
| `Status` | `'disconnected' \| 'connecting' \| 'connected' \| 'failed'`, derived from `ConnState` |
| `EventType` | `'CONNECT' \| 'OPENED' \| 'ERROR' \| 'RETRY' \| 'DISCONNECT'`, derived from `ConnEvent` |
| `Transitions` | an object type: status → event type → next status (table below); its keys are exactly `Status` |
| `StateOf<S>` | the member(s) of `ConnState` whose `status` is `S` |
| `EventFor<S>` | the member(s) of `ConnEvent` legal in status `S` |
| `NextStatus<S, T>` | the status reached from `S` by event type `T`, or `never` if illegal |
| `send(state, event)` | accepts only an `event` legal for `state`'s status, and returns `StateOf<the next status>` |

| from | event → to |
| --- | --- |
| `disconnected` | `CONNECT` → `connecting` |
| `connecting` | `OPENED` → `connected`, `ERROR` → `failed`, `DISCONNECT` → `disconnected` |
| `connected` | `ERROR` → `failed`, `DISCONNECT` → `disconnected` |
| `failed` | `RETRY` → `connecting`, `DISCONNECT` → `disconnected` |

So `send(failedState, { type: 'RETRY' })` has type `StateOf<'connecting'>`,
and you can read `.attempt` off it without a check.

## The rule for un-narrowed states

When `S` is a union — you hold a `ConnState` and have not checked its
status — `EventFor<S>` must be the events legal in **every** one of those
statuses. `EventFor<'connected' | 'failed'>` is just `DISCONNECT`, and
`EventFor<Status>` is `never`: the compiler makes you narrow first.

Handy fact: `keyof (A | B)` is the keys **common** to `A` and `B`. A
conditional type `S extends … ? … : …` over a bare `S` does the opposite — it
distributes and gives you the *union* of each status's events. That is the
trap.

The body of `send` needs one cast (`as`) on its return: the compiler cannot
follow a runtime `switch` into a type-level table lookup.
