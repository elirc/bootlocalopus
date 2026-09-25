A search box that calls the API on every keystroke has three bugs, usually
all at once:

1. **Wasted requests.** Typing `laptop` fires six. Debounce: wait until the
   user pauses.
2. **Out-of-order results.** The request for `lap` can answer *after* the one
   for `laptop`, and the list shows results for what the user typed a second
   ago. Aborting the old request helps, but it is not enough on its own: an
   API client that ignores the signal, or a response that already arrived
   and is being parsed, still resolves. Only the **latest** request may
   render.
3. **Error noise.** An aborted `fetch` rejects with an `AbortError`. That is
   not a failure, and showing "Something went wrong" for it is a bug.

## Task

Export `createTypeahead({ search, render, delayMs = 250, setTimeout, clearTimeout })`.
`search(query, { signal })` returns a promise of results; `render(state)` shows
a state; the timer functions are injected (the grader uses fake ones — use the
ones passed in, not the globals). It returns `{ input(text), dispose() }`.

The **current query** starts as `''`. Every call to `input(text)`:

1. cancels any pending (debounced) timer;
2. takes `query = text.trim()`;
3. if `query` equals the current query, does nothing more;
4. if `query` is `''`: aborts the in-flight request (if any), sets the current
   query to `''` and **immediately** renders
   `{ status: 'idle', query: '', results: [] }`;
5. otherwise schedules, after `delayMs`, a request for `query`.

When a request starts: abort the previous in-flight request, set the current
query, render `{ status: 'loading', query, results }` where `results` are the
ones currently shown (the last rendered state's `results`, `[]` at first),
then call `search(query, { signal })` with a new `AbortController`'s signal.

When it settles, render — **only if it is still the latest request and it was
not aborted** —
`{ status: 'success', query, results }` or
`{ status: 'error', query, results: [], error }`.

`dispose()` cancels the pending timer and aborts the in-flight request; nothing
renders after it.

Note step 3: typing `lap`, then `lapt`, then deleting back to `lap` within the
debounce window starts no second request for `lap` if `lap` is current.
