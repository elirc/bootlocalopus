Most slow React pages are not slow because of React. They are slow because
of **when** and **how** they fetch.

**Waterfalls.** A parent fetches the user, renders, and only then does its
child mount and fetch the user's projects; the child's child then fetches the
tasks. Three round trips in sequence, each waiting for a render. Fetching in
effects makes waterfalls the default. The fixes: start independent requests
together (`Promise.all`, or several queries started at the same level),
**prefetch** in the route loader or on hover, or ask the API for the combined
shape.

**Two clocks.** Query caches have two different settings that are easy to
confuse:

- **stale time**: how long data counts as fresh. Fresh data is served with
  no request; stale data is still shown, then revalidated in the background.
- **cache (gc) time**: how long unused data stays in memory at all. After
  that, the next visitor sees a loading state.

**Server state is not client state.** A response is a snapshot of data the
server owns and anyone can change. Treat it as a cache that can be stale,
refetched, and invalidated, not as state you own and must keep in sync by
hand.

**Mutations.** After a write, either update the cache from the response
(`setQueryData`), invalidate the affected queries so they refetch, or both.
Optimistic updates are a third option when you can also roll back.

Answer the questions below.
