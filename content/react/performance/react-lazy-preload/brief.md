`React.lazy` splits a page into its own chunk, which shrinks the first
download. It also moves the wait to the worst possible moment: the user
clicks **Reports**, and only then does the browser start fetching the Reports
chunk. On a slow connection that is a second of spinner on every first visit.

Two more things go wrong in production:

- After a deploy, an open tab asks for a chunk file that no longer exists, or
  a flaky network drops one request. `React.lazy` **caches the rejection
  forever**: re-rendering the component will not try again.
- The usual "preload" hack calls the `import()` function directly on hover,
  separately from `lazy`. That is two loads of the same chunk, and nothing
  shares the retry.

## Task

### `lazyWithPreload(factory, { retries = 1 } = {})`

`factory` is a function returning a promise of a module (`() => import('./Reports')`),
whose `default` export is the component. Return a lazy component (usable
inside `<Suspense>`, exactly like `React.lazy(factory)`) with one extra
method:

- `Component.preload()` starts loading and returns a promise of the module.
- Nothing loads until the component renders or `preload()` is called.
- **One load in total**: `preload()` returns the **same promise** every
  time, and rendering the component (once or many times, before or after a
  preload) reuses that load. `factory` is called once, unless it fails.
- If `factory()` rejects, call it again, up to `retries` more times
  (`retries: 0` means no retry). If every attempt fails, the promise rejects
  with the **last** error.

### `PageSwitcher({ pages })`

`pages` is `[{ name, Component }]`, each `Component` made by
`lazyWithPreload`. The starter already renders a `<nav aria-label="Pages">`
of buttons (the current one has `aria-current="page"`) and the current page
inside an error boundary and `<Suspense fallback={<p>Loading…</p>}>`. Add:

- **Preload on intent**: when a nav button gets `mouseenter` or `focus`
  (keyboard users never hover), call that page's `preload()`.
- A preload that fails must **not** become an unhandled rejection. It is not
  the user's problem yet; if they do open the page, the error boundary shows
  `Could not load <name>` (in a `role="alert"`, as the starter has it).
- After a page fails, switching to another page shows that page: the error
  boundary must not stay stuck in its error state.
