A single-page app has to take over link clicks, or every click reloads the
whole app. Taking them over **too eagerly** is the more common bug, and users
notice it immediately:

- Ctrl/Cmd-click, Shift-click and middle-click stop opening new tabs.
- `target="_blank"`, `download` and `mailto:` links navigate the SPA instead.
- A click on the `<svg>` icon **inside** the link is ignored, because the
  handler checked `event.target.tagName === 'A'`.
- `#section` links stop scrolling.
- Clicking the link to the page you are on piles up duplicate history
  entries, so Back appears to do nothing.
- The Back button changes the URL but not the page, because nobody listens
  for `popstate`.

The standard technique is **event delegation**: one `click` listener on a
root element, which walks up from `event.target` with
`closest('a[href]')`. It works for links rendered later, too.

## Task

Export `startNavigation({ root = document, onNavigate })`. It returns
`{ navigate(to, options), stop() }`. A *location* below is
`pathname + search + hash`, e.g. `/products/42?tab=qa#top`.

**`navigate(to, { replace = false } = {})`**: resolve `to` against
`location.href`. If the result has a different origin, throw a `TypeError`.
Otherwise update the history with its location — `history.replaceState` when
`replace` is `true` **or** the location equals the current one, else
`history.pushState` (pass `null` as the state) — then call
`onNavigate(location)`.

**Clicks**: add one `click` listener to `root`. For a click, find the closest
`a[href]` from `event.target` that is inside `root`. Leave the event
completely alone (no `preventDefault`, no navigation) when:

1. `event.defaultPrevented` is already `true`;
2. `event.button !== 0`, or any of `metaKey`, `ctrlKey`, `shiftKey`,
   `altKey` is set;
3. there is no such link;
4. the link has a `target` attribute other than `''` or `_self`
   (case-insensitive), or a `download` attribute;
5. the link's URL (`link.href` is already absolute) has another origin —
   this includes `mailto:` and `tel:`;
6. the link's URL has a hash and differs from the current location **only**
   in its hash (same pathname and search).

Otherwise call `event.preventDefault()` and `navigate(location of the link)`.

**Back/forward**: listen for `popstate` on `window` and call
`onNavigate(current location)`.

**`stop()`** removes both listeners.
