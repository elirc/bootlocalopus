// A working state machine with stringly-typed everything: any state, any
// event, any target. A typo in the config is a machine that silently gets
// stuck at runtime. Derive the names from the config instead.

export type StatesConfig = Record<string, { readonly on: Readonly<Record<string, string>> }>;

// TODO: each of these should be computed from States.
export type StateName<States extends StatesConfig> = string;
export type EventsIn<States extends StatesConfig, S extends StateName<States>> = string;
export type EventName<States extends StatesConfig> = string;
export type FinalState<States extends StatesConfig> = string;

export interface Machine<States extends StatesConfig> {
  readonly initial: string;
  readonly states: States;
  transition(state: string, event: string): string;
  can(state: string, event: string): boolean;
  isFinal(state: string): boolean;
  start(): Service<States>;
}

export interface Service<States extends StatesConfig> {
  state: string;
  send(event: string): boolean;
}

export type StateOf<M> = string;
export type EventOf<M> = string;

export function defineMachine<States extends StatesConfig>(config: { initial: string; states: States }): Machine<States> {
  const { states, initial } = config;
  const targetOf = (state: string, event: string): string | undefined =>
    Object.hasOwn(states[state].on, event) ? states[state].on[event] : undefined;

  return {
    initial,
    states,
    transition: (state, event) => states[state].on[event],
    can: (state, event) => targetOf(state, event) !== undefined,
    isFinal: (state) => Object.keys(states[state].on).length === 0,
    start() {
      let current = initial;
      return {
        get state() {
          return current;
        },
        set state(next: string) {
          current = next;
        },
        send(event) {
          const target = targetOf(current, event);
          if (target === undefined) return false;
          current = target;
          return true;
        },
      };
    },
  };
}
