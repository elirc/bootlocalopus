A support engineer pastes a link to "the filtered orders view" into a ticket.
The customer opens it and sees the unfiltered list, because the filters lived
in `useState`. They press Back to undo a filter and leave the page instead.
Refresh loses everything.

State that should survive a refresh, be shareable, or be undone with Back
belongs in the **URL**. The URL is then the single source of truth: the
component reads from it, writes to it, and re-renders when it changes,
including when the **browser** changes it (Back and Forward fire `popstate`).

Two details separate a working version from a correct one:

- **push versus replace.** A category change is a navigation the user may
  want to undo with Back: `history.pushState`. Typing in a search box is not:
  eleven keystrokes must not become eleven history entries.
  `history.replaceState`.
- **Other parameters survive.** Setting `category` must not drop `q` or an
  unrelated `utm_source` someone else's code relies on.

## Task

1. Export `useSearchParam(name, defaultValue = '')` returning
   `[value, setValue]`:
   - `value` is the `name` parameter of `window.location.search`, or
     `defaultValue` when it is absent.
   - `setValue(next, { replace = false } = {})` writes the new URL with
     `history.pushState(null, '', url)`, or `history.replaceState` when
     `replace` is true. Keep the path and every other parameter. When `next`
     is `''` or equals `defaultValue`, **remove** the parameter instead (clean
     links). Setting the value it already has must not add a history entry.
   - every component using the hook re-renders after `setValue` (the browser
     does not fire `popstate` for `pushState`, so notify them yourself), and
     after a `popstate` event on `window`.
   - nothing is left listening after unmount.

2. Export `ProductSearch({ products })`, where `products` is
   `[{ id, name, category }]`, rendering:
   - `<input type="search" aria-label="Search">` bound to the `q` parameter,
     written with `replace: true`
   - `<select aria-label="Category">` bound to `category` (default `'all'`,
     so `all` never appears in the URL), with an `all` option followed by one
     option per distinct category in the order they first appear in
     `products`, written with a **push**
   - a `<ul>` with one `<li>{name}</li>` per product whose name contains `q`
     (case-insensitive) and whose category matches (`all` matches any)
