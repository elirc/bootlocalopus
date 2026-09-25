Adding an item is a mutation followed by a refetch of the list, and the
straightforward version has three production bugs:

- **Double submit.** The user presses Enter twice; two `POST`s go out and the
  todo appears twice. The button must be disabled while the mutation is
  pending.
- **Stale refetch wins.** The list was already refreshing (a poll, a
  "Refresh" click) when the mutation finished and triggered another refetch.
  The older request resolves **last** and puts the list back to how it was
  before the new item existed. The rule: for a given query, only the
  **latest** request's response may be applied.
- **Lost invalidation.** The "Add" form lives in a modal that closes on
  submit. The component unmounts before the `POST` resolves and the list is
  never refreshed. Invalidation belongs to the mutation's success, not to
  the component that happened to start it.

## Task

1. Export `useLatestQuery(fetcher)` returning
   `{ data, error, isFetching, refetch }`:
   - fetches on mount; `refetch()` starts a new request (even if one is in
     flight) and is stable across renders.
   - only the response (or error) of the **most recently started** request
     is applied; older ones are ignored whenever they settle.
   - keeps `data` while refetching; `error` is `null` after a success;
     `isFetching` is `true` while the latest request is in flight.

2. Export `useMutation(mutationFn, { onSuccess, onError } = {})` returning
   `{ mutate, status, data, error, reset }`:
   - `status` is `'idle'`, `'pending'`, `'success'` or `'error'`.
   - `mutate(variables)` calls `mutationFn(variables)`, sets `'pending'`, then
     `'success'` with `data`, or `'error'` with `error`. It returns nothing
     and never produces an unhandled rejection.
   - `onSuccess(data, variables)` / `onError(error, variables)` are called
     for **every** `mutate` call, using the **latest** callbacks passed to
     the hook, **even if the component has unmounted** by then. State is
     only updated while mounted, and only by the latest `mutate` call.
   - `reset()` returns to `{ status: 'idle', data: undefined, error: null }`.
   - `mutate` and `reset` are stable across renders.

3. Export `TodoApp({ api })`, where `api.fetchTodos()` resolves to
   `[{ id, title }]` and `api.addTodo(title)` resolves to the new todo:
   - a `<ul>` of `<li>{title}</li>`, and a `Refresh` button that refetches
   - a `<form>` with `<input aria-label="New todo">` and a submit button
     `Add`, which is `disabled` while the mutation is pending
   - submitting calls `addTodo` with the input's value; on success, clear the
     input and refetch the list; on failure, keep the text and show
     `<p role="alert">Could not add todo: {error.message}</p>`
