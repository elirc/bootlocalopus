An autocomplete looks like an input and a `<ul>`. Built that way, a screen
reader hears "edit text" and nothing else, arrow keys move the caret, every
keystroke fires a request, and a slow response for `a` lands after the fast
one for `apr` and shows the wrong list.

## Task

Export `Combobox({ label, fetchOptions, onSelect, debounceMs = 250 })`
following the ARIA 1.2 combobox pattern.

- `fetchOptions(query, signal)` returns a promise of `[{ id, label }]`.
- `onSelect(option)` receives the chosen option object.

**Structure** (all checked by the grader)

- a `<label>` with `label`, associated with an `<input role="combobox">`
- on the input: `aria-autocomplete="list"`, `aria-controls` = the listbox's
  id, `aria-expanded` = `"true"` / `"false"`, and `aria-activedescendant` = the
  id of the active option (**omitted** when no option is active or the list is
  collapsed)
- a `<ul role="listbox">` that is **always in the DOM** (so `aria-controls`
  always resolves) and has the `hidden` attribute while collapsed
- one `<li role="option">` per result, each with a **unique `id`**, and
  `aria-selected="true"` on the active one, `"false"` on the rest
- a live region `<div role="status">` announcing the result count:
  `3 results`, `1 result`, `No results`; empty before any search and after
  the input is cleared

**Searching**

1. Debounce: call `fetchOptions` only after `debounceMs` without typing, with
   the trimmed input. A burst of keystrokes makes **one** call. A blank input
   makes none: it collapses the list and empties the live region.
2. When the input changes again, or the component unmounts, cancel the
   pending timer and **abort** the in-flight request's `signal`.
3. Only the latest request may update the screen. `fetchOptions` is free to
   ignore the signal, so a stale response can still resolve, in any order:
   ignore it.
4. A rejected request (an `AbortError`, or a real failure) changes nothing on
   screen, and must not become an unhandled rejection.
5. Results replace the options with none active, and expand the list if
   there is at least one. Zero results stay collapsed.
6. Parents pass `fetchOptions` and `onSelect` inline. A parent re-render must
   not restart the debounce or abort the request.

**Keyboard** (on the input)

- `ArrowDown`: next option, wrapping from last to first; from none, the
  first. If the list is collapsed but has options (after Escape), reopen it
  with the first active.
- `ArrowUp`: previous option, wrapping; from none (or reopening), the last.
- `Enter` with an active option: select it. With none active: do nothing.
- `Escape`: collapse; keep the typed text.
- Typing clears the active option.

**Selecting** (Enter, or a click on an option): call `onSelect(option)`, put
its `label` in the input, collapse, and do **not** search for that label.

Focus stays in the input throughout: `aria-activedescendant` is how the
screen reader learns which option is current. The grader runs with
`debounceMs={1}` and settles every request by hand with deferred promises, so
the order of responses is whatever the test wants.
