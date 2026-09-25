// A working store with no types to speak of: state is `any`, every action is
// accepted, and every selector result is `any`. The runtime is fine; give it
// signatures.

export interface Action {
  type: string;
}

export type Reducer<S, A extends Action> = (state: S, action: A) => S;

// TODO: the state type a reducer manages.
export type StateOf<R> = any;

// TODO: the action type a reducer accepts (for a union of reducers, the union of their actions).
export type ActionOf<R> = any;

export function combineReducers(reducers: Record<string, Reducer<any, any>>): Reducer<any, any> {
  const slices = Object.entries(reducers);
  return (state, action) => {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, reducer] of slices) {
      next[key] = reducer(state[key], action);
      if (next[key] !== state[key]) changed = true;
    }
    return changed ? next : state;
  };
}

export interface Store<S, A extends Action> {
  getState(): S;
  dispatch(action: A): A;
  subscribe(listener: (state: S) => void): () => void;
  select<R>(selector: (state: S) => R): R;
}

export function createStore(reducer: Reducer<any, any>, initial: any): Store<any, any> {
  let state = initial;
  const listeners = new Set<(state: any) => void>();
  return {
    getState: () => state,
    dispatch(action) {
      const next = reducer(state, action);
      if (next !== state) {
        state = next;
        for (const listener of [...listeners]) listener(state);
      }
      return action;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    select: (selector) => selector(state),
  };
}

export function createSelector(inputs: ((state: any) => any)[], combine: (...values: any[]) => any): (state: any) => any {
  let last: { values: unknown[]; result: unknown } | undefined;
  return (state) => {
    const values = inputs.map((select) => select(state));
    if (last && values.every((value, i) => Object.is(value, last!.values[i]))) return last.result;
    const result = combine(...values);
    last = { values, result };
    return result;
  };
}
