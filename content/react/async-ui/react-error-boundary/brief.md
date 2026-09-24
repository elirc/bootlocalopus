One widget throws during render and React 18 unmounts **the whole tree**:
the user is left with a blank page because a sparkline got a `null`. An
error boundary draws a line around the part that is allowed to fail.

Boundaries are still class components. There is no hook for
`getDerivedStateFromError` / `componentDidCatch`.

## Task

Export a class component `ErrorBoundary` with these props:

- `children` — rendered as-is while nothing has gone wrong
- `fallbackRender({ error, reset })` — called when a descendant threw while
  rendering; whatever it returns is rendered **instead of** `children`.
  `error` is the thrown value, `reset` is a function.
- `onError(error, info)` — optional; called **once per caught error**, with
  the error and React's `info` object (it has a `componentStack` string). This
  is where you would report to your error tracker.
- `resetKeys` — optional array. When the boundary is showing its fallback and
  any element of `resetKeys` changes (compare element by element with
  `Object.is`, and treat a length change as a change), the boundary resets.

Behaviour the grader checks:

1. A child that throws during render shows the fallback; the error it
   receives is the thrown one (`error.message` is readable). JavaScript can
   throw anything, so a thrown `null` must show the fallback too.
2. Calling `reset()` clears the error and renders `children` again as a
   **fresh mount**: their state starts from scratch. If they throw again, the
   fallback comes back (and `onError` is called again).
3. Changing `resetKeys` while the fallback is showing resets it.
   Changing `resetKeys` while **healthy** does nothing: the children keep
   their state (so no `key={resetKeys.join()}` tricks). And if the keys
   change in the **same** update in which a child starts throwing, show the
   fallback; do not reset straight back into the broken child.
4. A sibling **outside** the boundary stays mounted, with its state, while the
   boundary shows its fallback.
5. An error thrown in an **event handler** is *not* caught. Boundaries only
   catch errors thrown while React is rendering, in lifecycle methods and in
   effects. A throwing `onClick` leaves the children on screen; the error goes
   to `window`'s `error` event and the console. Nothing for you to implement:
   the grader checks you did not fake it. (To route a handler error into a
   boundary, catch it, put it in state, and `throw` it during the next render.)

Errors thrown in async code (`setTimeout`, a rejected promise) are not caught
either, for the same reason: React is not on the stack.
