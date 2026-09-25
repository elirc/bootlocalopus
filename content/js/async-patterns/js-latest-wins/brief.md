The user types "re", then "react". Two requests go out. The one for "re" is a
broader search, so it comes back **second** — and the results list now shows
matches for "re" under a search box that says "react". Debouncing makes this
rarer; it does not make it impossible. The fix is to make every call
**supersede** the previous one: abort the old request, and never deliver its
result even if it arrives anyway.

"Abort" alone is not enough. Plenty of code ignores its `AbortSignal` (a
cached value, a library that does not take one, a CPU step after the fetch),
so the wrapper itself must refuse to deliver a stale result.

## Task

Export a class `SupersededError extends Error` (its `name` is
`'SupersededError'`) and a function `latestOnly(fn)`.

`latestOnly(fn)` returns `run(...args)`:

- Each call creates a fresh `AbortController` and calls
  `fn(...args, { signal })`. It returns a promise.
- Starting a new call **supersedes** the previous one if it is still pending:
  - its signal is aborted with a `SupersededError` as the reason;
  - its promise rejects with a `SupersededError` **right away**, without
    waiting for its `fn` to settle — and stays that way, **whatever** its `fn`
    later resolves or rejects with.
- A call that already settled is not affected by later calls (its signal is
  not aborted).
- The latest call's promise settles with its own `fn`'s result or error.
- A synchronous throw from `fn` becomes a rejection of that call's promise.
- `run.cancel()` supersedes the pending call (if any) without starting a new
  one: its signal aborts and its promise rejects with a `SupersededError`.
