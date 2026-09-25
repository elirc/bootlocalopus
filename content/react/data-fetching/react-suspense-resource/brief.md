With Suspense, a component reads data as if it were already there, and React
shows the nearest `<Suspense fallback>` until it is. The contract is small: a
component that is not ready **throws a promise**; React catches it, shows the
fallback, and renders again when the promise settles. Errors thrown during
render go to the nearest **error boundary**.

The trap is where the promise comes from. `read` is called on **every**
render, and a render can be thrown away and retried. Start the request inside
render without a cache and every retry starts a new request, which suspends
again, forever. The request must live in a cache **keyed by what it loads**,
created outside the component.

The second trap is UX. Switching from one profile to another should not blank
the page with a spinner: wrap the switch in `startTransition` and React keeps
showing the current content while the next one loads. But that only works
for Suspense boundaries that are **already on screen**. Give the boundary
`key={userId}` (the usual way to reset it) and every switch mounts a fresh
boundary, which shows its fallback, transition or not.

## Task

1. Export `createResourceCache(loader)`, where `loader(key)` returns a
   promise, returning `{ read, preload, invalidate }`:
   - `read(key)`: the first call for a key calls `loader(key)`. While it is
     pending, `read` **throws a promise** that settles when it does. Once it
     resolved, `read` returns the value; once it rejected, `read` throws the
     error. `loader` is called **once** per key however often `read` runs.
   - if `loader` throws synchronously, treat it like a rejection.
   - `preload(key)` starts loading without throwing.
   - `invalidate(key)` forgets the key; the next `read` loads it again.

2. Export `ProfilePage({ resource, userId })` reading
   `resource.read(userId)` (a `{ name }`) in a child component and
   rendering `<h2>{name}</h2>`, with:
   - `<p>Loading profile…</p>` as the Suspense fallback
   - an error boundary showing `<p role="alert">Could not load profile</p>`
     and a `Try again` button, which invalidates `userId` and renders the
     profile again (so it loads again)
   - a new `userId` clears a previous error, **without** remounting the
     Suspense boundary (see above: no `key`)

3. Export `ProfileSwitcher({ resource, userIds })`: one button
   `Show {id}` per id, starting on the first, and
   `<section aria-label="Profile" aria-busy={isPending}>` around a
   `ProfilePage`. Switching happens in a **transition**: the current profile
   stays on screen, with `aria-busy="true"`, until the next one is ready.
