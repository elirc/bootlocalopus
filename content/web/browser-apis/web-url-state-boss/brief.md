The product list's filters live in the URL, so a filtered view can be
bookmarked, shared and restored by the Back button. Every piece of this
chapter meets here, and so do their bugs:

- The URL is **input**: `?page=-3&sort=hacked&tag=b&tag=a&tag=a` arrives from
  a pasted link. Parse it into a valid state, and write the canonical URL
  back without adding a history entry.
- Changing a filter on page 7 shows an empty page 7. Filters reset the page.
- Every keystroke that pushes a history entry turns Back into a 40-click
  undo. Choose push or replace deliberately — and never push the URL you are
  already on.
- Back changes the URL but not the list unless you listen for `popstate`.
- Fast clicks race: only the latest request may render.

## Task

Export three functions. A **state** is `{ q, tags, sort, page }`.

### `parseState(search)`

`search` is a query string with or without the leading `?`.

- `q`: the `q` parameter, trimmed; `''` if absent.
- `tags`: every `tag` value, trimmed, empties dropped, **de-duplicated and
  sorted** (`localeCompare` is not needed: plain `sort()`).
- `sort`: one of `relevance`, `price-asc`, `price-desc`, `newest`; anything
  else (or absent) is `relevance`.
- `page`: the `page` parameter if it is all digits and at least `1`, as a
  number; otherwise `1`.

### `toSearch(state)`

The canonical query string: build a `URLSearchParams` appending, in this
order, `q` (if not `''`), one `tag` per tag, `sort` (if not `relevance`) and
`page` (if not `1`). Return `''` when it is empty, else `'?' + params`.
So `toSearch(parseState(s))` is the canonical form of any `s`.

### `startListPage({ fetchPage, render })`

Returns `{ update(patch, options), getState(), stop() }`.

**Loading a state** (used below): abort the previous request, render
`{ status: 'loading', state, items }` (`items` = the items currently shown,
`[]` at first), call `fetchPage(state, { signal })`, which resolves to
`{ items, total }`. If this is still the latest load and it was not aborted,
render `{ status: 'success', state, items, total }`, or on rejection
`{ status: 'error', state, items: [], error }`.

**Start**: parse `location.search`. If it is not already canonical, rewrite
it with `history.replaceState` (keeping `location.pathname` and
`location.hash`). Then load the state.

**`update(patch, { replace = false } = {})`**: the next state is the current
one with `patch` applied, then normalised with
`parseState(toSearch(...))`. If the normalised `q`, `tags` or `sort` differ
from the current ones and `patch` has no `page` key, the page becomes `1`
(so `tags: ['b', 'a']` when `['a', 'b']` is current changes nothing). If the canonical search equals
the current `location.search`, do **nothing** (no history entry, no request).
Otherwise `history.pushState` (or `replaceState` with `replace: true`) to
`location.pathname + search` — the hash is dropped — then load it.

**`popstate`**: parse `location.search`; if its canonical search differs
from the current state's, load it (never write history here).

**`getState()`** returns the current state. **`stop()`** removes the
`popstate` listener and aborts the in-flight request; nothing renders after.
