/** The shape every machine config has: each state maps event names to a target state. */
export type StatesConfig = Record<string, { readonly on: Readonly<Record<string, string>> }>;

/** Rejects any transition whose target is not one of the machine's own states. */
type ValidTargets<States extends StatesConfig> = {
  [S in keyof States]: { readonly on: Readonly<Record<string, keyof States & string>> };
};

export type StateName<States extends StatesConfig> = keyof States & string;

/** The events a given state accepts. */
export type EventsIn<States extends StatesConfig, S extends StateName<States>> = keyof States[S]['on'] & string;

/** Every event the machine knows, in any state. */
export type EventName<States extends StatesConfig> = {
  [S in StateName<States>]: EventsIn<States, S>;
}[StateName<States>];

/** States with no outgoing transitions. */
export type FinalState<States extends StatesConfig> = {
  [S in StateName<States>]: [EventsIn<States, S>] extends [never] ? S : never;
}[StateName<States>];

export interface Machine<States extends StatesConfig> {
  readonly initial: StateName<States>;
  readonly states: States;
  /** The next state, typed from the config: `transition('idle', 'FETCH')` is `'loading'`. */
  transition<S extends StateName<States>, E extends EventsIn<States, S>>(state: S, event: E): States[S]['on'][E];
  /** Whether `event` does anything in `state`, for events that arrive at runtime. */
  can(state: StateName<States>, event: string): boolean;
  isFinal(state: StateName<States>): state is FinalState<States>;
  start(): Service<States>;
}

export interface Service<States extends StatesConfig> {
  readonly state: StateName<States>;
  /** Applies the event if the current state accepts it; returns whether it did. */
  send(event: EventName<States>): boolean;
}

export type StateOf<M> = M extends Machine<infer States> ? StateName<States> : never;
export type EventOf<M> = M extends Machine<infer States> ? EventName<States> : never;

export function defineMachine<States extends StatesConfig>(config: {
  initial: StateName<States>;
  states: States & ValidTargets<States>;
}): Machine<States> {
  const { states, initial } = config;
  // An own-property check: `'toString' in on` would be true for every object.
  const targetOf = (state: StateName<States>, event: string): string | undefined =>
    Object.hasOwn(states[state].on, event) ? states[state].on[event] : undefined;

  const machine: Machine<States> = {
    initial,
    states,
    transition<S extends StateName<States>, E extends EventsIn<States, S>>(state: S, event: E) {
      // The checker widens the lookup through the config's constraint; the
      // signature above is the precise, caller-facing type.
      return states[state].on[event] as States[S]['on'][E];
    },
    can: (state, event) => targetOf(state, event) !== undefined,
    isFinal: (state): state is FinalState<States> => Object.keys(states[state].on).length === 0,
    start() {
      let current: StateName<States> = initial;
      return {
        get state() {
          return current;
        },
        send(event) {
          const target = targetOf(current, event);
          if (target === undefined) return false;
          // ValidTargets guaranteed every target is a state name.
          current = target as StateName<States>;
          return true;
        },
      };
    },
  };
  return machine;
}
