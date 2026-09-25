"Added to cart" appears as a toast, a spinner stops, a filter now shows 12
results. A sighted user sees it. A screen reader user hears nothing, because
nothing they were focused on changed. **Live regions** fix that: when the
content of an element with `aria-live` changes, the screen reader reads the
change out.

They are easy to get subtly wrong:

- A live region that is **inserted** already holding its message is usually
  not announced. The region must exist, empty, before the message arrives.
- Screen readers announce **changes**. Setting the same text twice ("Added to
  cart", then again for a second item) changes nothing and says nothing.
- Every component rendering its own region scatters them across the page;
  apps keep one polite and one assertive region at the root and send
  messages to them.

## Task

### `AnnouncerProvider({ children })` and `useAnnounce()`

- `AnnouncerProvider` renders its `children` and **two regions that exist
  from the first render**, empty: `<div aria-live="polite" aria-atomic="true">`
  and `<div aria-live="assertive" aria-atomic="true">`. (Hide them visually
  with a "visually hidden" style if you like; the grader does not care.)
- `useAnnounce()` returns `announce(message, politeness = 'polite')`, which
  puts `message` in the matching region, replacing whatever that region
  said before. The other region is left alone.
- Each announcement is rendered as a **new element** inside the region (for
  example a `<p>` whose `key` changes on every call), so that announcing the
  same text twice is a DOM change a screen reader will read again.
- `announce` keeps the **same identity** across re-renders, so components
  can list it in effect dependencies without re-running them.
- `useAnnounce()` outside a provider throws an `Error` whose message is
  `useAnnounce must be used inside <AnnouncerProvider>`.

### `AddToCart({ name, onAdd })`

A `<button type="button">` reading `Add <name> to cart`. On click it calls
`onAdd()`, which returns a promise:

- while it is pending the button is `disabled` and a second click does
  nothing;
- when it resolves, announce `Added <name> to cart` politely;
- when it rejects, announce `Could not add <name> to cart` **assertively**,
  and re-enable the button. The rejection must not escape as an unhandled
  rejection.
