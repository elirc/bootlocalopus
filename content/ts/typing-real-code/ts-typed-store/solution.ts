export interface Action {
  type: string;
}

export type Reducer<S, A extends Action> = (state: S, action: A) => S;

/**
 * Any reducer at all. Parameters are contravariant, so the widest function type
 * that every reducer is assignable to takes `never` — no `any` required.
 */
type AnyReducer = (state: never, action: never) => unknown;

export type StateOf<R> = R extends (state: infer S, action: never) => unknown ? S : never;

/** Distributes over a union of reducers, giving the union of their actions. */
export type ActionOf<R> = R extends (state: never, action: infer A extends Action) => unknown ? A : never;

export type CombinedState<M> = { [K in keyof M]: StateOf<M[K]> };
export type CombinedAction<M> = ActionOf<M[keyof M]>;

export function combineReducers<M extends Record<string, AnyReducer>>(
  reducers: M,
): Reducer<CombinedState<M>, CombinedAction<M>> {
  // Every slice reducer sees every action and returns its own state untouched
  // for actions it does not handle. That is the contract that makes this cast honest.
  const slices = Object.entries(reducers) as [string, (state: unknown, action: Action) => unknown][];
  return (state, action) => {
    const current = state as Record<string, unknown>;
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, reducer] of slices) {
      next[key] = reducer(current[key], action);
      if (next[key] !== current[key]) changed = true;
    }
    // Keep the same object when nothing changed, so subscribers can compare by reference.
    return changed ? (next as CombinedState<M>) : state;
  };
}

export interface Store<S, A extends Action> {
  getState(): S;
  dispatch(action: A): A;
  subscribe(listener: (state: S) => void): () => void;
  select<R>(selector: (state: S) => R): R;
}

/** The reducer decides S; the initial state is only checked against it. */
export function createStore<S, A extends Action>(reducer: Reducer<S, A>, initial: NoInfer<S>): Store<S, A> {
  let state = initial;
  const listeners = new Set<(state: S) => void>();
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

/** The results of a tuple of selectors, as a tuple. */
export type SelectorResults<Sel> = { [K in keyof Sel]: Sel[K] extends (state: never) => infer V ? V : never };

/**
 * The state every selector can read. Inferring from a parameter of a union of
 * functions gives the intersection, so mismatched selectors demand both states.
 */
export type SelectorState<Sel extends readonly unknown[]> = Sel[number] extends (state: infer S) => unknown ? S : never;

/**
 * A memoised derived value: the combiner re-runs only when an input
 * selector's result changes (by Object.is).
 */
export function createSelector<Sel extends ((state: never) => unknown)[], R>(
  inputs: [...Sel],
  combine: (...values: SelectorResults<Sel>) => R,
): (state: SelectorState<Sel>) => R {
  // Every selector accepts SelectorState<Sel> by construction.
  const selectors = inputs as unknown as ((state: SelectorState<Sel>) => unknown)[];
  let last: { values: unknown[]; result: R } | undefined;
  return (state) => {
    const values = selectors.map((select) => select(state));
    if (last && values.every((value, i) => Object.is(value, last!.values[i]))) return last.result;
    const result = combine(...(values as SelectorResults<Sel>));
    last = { values, result };
    return result;
  };
}
