```ts
const checkout = defineMachine({
  initial: 'cart',
  states: {
    cart: { on: { PAY: 'paying' } },
    paying: { on: { SUCCESS: 'paid', FAIL: 'cart' } },
    payed: { on: {} },       // typo: SUCCESS now leads to a state that does not exist
  },
});
```

State machines are how you make illegal states and illegal transitions
unrepresentable — checkout flows, upload widgets, order lifecycles, retry
logic. Typed as `Record<string, …>`, a machine protects nothing: the typo above
compiles, and the checkout gets stuck in production on the first successful
payment.

The config literal already contains everything the types need. This boss
derives all of it: the state names, the events each state accepts, the target
of every transition, and the final states — and it rejects a config whose
targets or initial state do not exist.

Techniques you will combine: key unions from object types, a mapped type
indexed by its own keys, `[X] extends [never]` to test for "no keys", a
parameter type that **validates** the argument by intersecting it with a
mapped version of itself, own-property checks, and type predicates.

## Task

`StatesConfig` is in the starter: an object mapping each state name to
`{ on: { EVENT: 'targetState', … } }`. Export these, all computed from a
config type `States`:

- **`StateName<States>`** — the union of state names (strings).
- **`EventsIn<States, S>`** — the events state `S` accepts; `never` for a
  state with an empty `on`.
- **`EventName<States>`** — every event of every state (the *union* across
  states, not just the events all states share).
- **`FinalState<States>`** — the states with no events.
- **`Machine<States>`** and **`Service<States>`**, with:
  - `initial` — a state name;
  - `states` — the config;
  - `transition(state, event)` — `event` must be one `state` accepts, and the
    return type is **that transition's literal target**:
    `transition('idle', 'FETCH')` is `'loading'`, not `string`;
  - `can(state, event: string)` — whether that state accepts that event, for
    events arriving as runtime strings; use an own-property check so
    `'toString'` is not an event;
  - `isFinal(state)` — a type predicate narrowing to `FinalState<States>`;
  - `start()` — a `Service` whose `state` is **read-only** (typed as a state
    name) and whose `send(event)` takes any of the machine's events, moves if
    the current state accepts it, and returns whether it moved.
- **`StateOf<M>`** / **`EventOf<M>`** — the state and event unions of a
  machine type.
- **`defineMachine({ initial, states })`** — returns the `Machine`. Callers do
  **not** write `as const`. A target that is not a state, an `initial` that is
  not a state, and a state without `on` are compile errors, reported on the
  config.

Inside `transition`, one assertion to the precise return type is expected, and
so is one in `send` (the target is a state because the config was validated).

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
