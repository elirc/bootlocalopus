Boss: the inbox re-renders every message on every keystroke. Someone already
tried wrapping the row in `memo`; nothing changed, so they concluded "memo
does not work" and moved on. It does work. Four different things are handing
every row a new reason to render, and each of them needs a different fix.

## Task

`InboxApp({ messages, onArchive })` renders a search box, a **Compact**
density toggle, a `N selected` status and one `MessageRow` per matching
message. It is correct and slow. Make it fast **without** making it wrong.

Keep the markup, the `renderLog` array and its pushes (`'app'` in
`InboxApp`, `'row:<id>'` in the row) exactly as they are: that is how this is
graded. Keep `MessageRow`'s props (`message`, `selected`, `onToggle`,
`onArchive`) and keep rows reading the density **from context** (every row in
a real app would be several levels down).

**Correct** (the starter already does all of this; keep it that way)

- Search filters by subject, case-insensitively.
- Toggling checkboxes one after another keeps every selection; the status
  reads `3 selected`, and so on.
- **Compact** sets `data-density="compact"` on every row and
  `aria-pressed="true"` on itself; pressing it again goes back to
  `comfortable`.
- **Archive** calls `onArchive(id)`. The parent passes `onArchive` as an
  inline arrow, so it is a new function on every render; archive must always
  call the **latest** one the parent passed.

**Fast** (measured with `renderLog`)

- `MessageRow` is wrapped in `memo`.
- Typing in the search re-renders **no row** that is still on screen. Rows
  that reappear when the search is cleared render once each.
- Toggling a row re-renders **only that row**, every time, not only the first.
- Changing density re-renders every row once (they really did change).
- A parent re-render with the same `messages` and a new inline `onArchive`
  re-renders **no row**.
- A new `messages` array in which one message object was replaced re-renders
  only that message's row.

**The traps**, one per bullet above: a context value that is a new object on
every render (or that carries more than the rows read) re-renders every
consumer, memo or not; a toggle callback that depends on the selection
changes on every toggle; and `useCallback(fn, [onArchive])` is correct but
changes on every parent render. The last one needs the "latest value in a
ref" pattern.
