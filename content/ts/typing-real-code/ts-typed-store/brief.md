```ts
const store = createStore(combineReducers({ cart, user }), initial); // Store<any, any>
store.dispatch({ type: 'cart/ad', sku });                           // typo: silently ignored
const count = store.select((s) => s.cart.itmes.length);             // typo: runtime TypeError
```

A state container is the most-read code in a front end: every component
selects from it and every event dispatches to it. Typed as `any`, it turns
every typo into a runtime bug and every refactor into a search-and-pray. The
Redux, Zustand and Pinia type definitions are all answers to the same
question: how do you type a store **once**, from its reducers, so every
call site is checked without annotations?

This boss puts together what the chapter covered: deriving types from
values, unions from a map, variadic tuples, and choosing which argument
decides a type parameter.

## Task

`Action`, `Reducer<S, A>` and `Store<S, A>` are in the starter; the runtime
code is complete. Replace the `any`s with types.

- **`StateOf<R>`** — the state a reducer manages.
- **`ActionOf<R>`** — the action a reducer accepts. For a **union** of
  reducers, the **union** of their actions. (Inferring a parameter type from
  a union of functions *without* distributing gives an intersection instead.
  A conditional type distributes only over a naked type parameter, so write
  `ActionOf` over its parameter `R` and pass it the union of reducers.)
- **`combineReducers(reducers)`** — takes an object of reducers and returns
  `Reducer<{ [key]: that reducer's state }, union of all their actions>`.
  `StateOf<typeof root>` must be exactly `{ cart: CartState; user: UserState }`,
  and `typeof root` exactly `Reducer<that state, that action union>`. A value
  that is not a reducer is a compile error. It nests: a combined reducer can be
  a slice of another.
- **`createStore(reducer, initial)`** — returns `Store<S, A>` with `S` and `A`
  taken from the reducer. An initial state with a misspelt, missing or
  mistyped slice is a compile error. `dispatch` rejects actions no reducer
  handles; `select` and `subscribe` are typed from the state.
- **`createSelector(inputs, combine)`** — `inputs` is an array of selectors
  `(state) => value`; `combine` receives their results **as parameters, in
  order, contextually typed** (no annotations at the call site). Returns
  `(state) => result`. The returned selector's `state` parameter must satisfy
  **every** input selector: combining a `(s: RootState) => …` with a
  `(s: { flag: boolean }) => …` gives a selector that needs both, which a store
  of plain `RootState` cannot run.

Two things to watch in `createSelector`:

1. TypeScript can infer a tuple of results `T` from `inputs` written as
   `{ [K in keyof T]: (state: S) => T[K] }`, but it will not infer `S` from
   inside that mapped type. Infer the **selectors themselves** as a tuple
   instead (`Sel extends …[]`, parameter `[...Sel]`), then compute the results
   and the state from `Sel`.
2. For the widest "any function" constraint without `any`, remember parameters
   are contravariant: every one-argument function is assignable to
   `(state: never) => unknown`.

Assertions inside the implementations are fine where the runtime code
reorganises data the checker cannot follow; the public signatures must not
use `any`.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
