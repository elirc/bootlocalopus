Someone spends ten minutes writing a note, clicks **Close** (or the browser's
back button, or closes the tab) and it is gone. The fix is a guard: while
there are unsaved changes, leaving asks first. There are two different exits
to guard, and they need two different mechanisms:

- **Leaving the page** (closing the tab, reloading, typing a new URL) can
  only be intercepted with the `beforeunload` event. The browser shows its
  own generic dialog; you cannot choose the text any more.
- **Leaving inside the app** (a Close button, a router link) is your own
  code, so you ask with your own confirm and only then carry on.

The usual bugs: a `beforeunload` listener that is added once and reads a
stale `dirty` value, so the prompt keeps appearing after the user saved (and
many browsers disable the back/forward cache for a page with a
`beforeunload` listener, so it should not stay registered when clean); and
a guard that prompts even when nothing has changed.

## Task

### `useUnsavedChangesGuard(when, options)`

`options` is optional: `{ message, confirm }`, where `message` defaults to
`You have unsaved changes. Leave anyway?` and `confirm` defaults to
`(text) => window.confirm(text)`.

- While `when` is true, a `beforeunload` listener on `window` calls
  `event.preventDefault()` and sets `event.returnValue = ''` (older browsers
  need the second). While `when` is false, **no** listener is registered;
  none is left behind on unmount.
- It returns `guard(action)`. If `when` is false, `guard` calls `action()`
  and returns `true`. Otherwise it calls `confirm(message)`: if that returns
  true it calls `action()` and returns `true`; if not, it returns `false`
  and does nothing.
- `guard` keeps **the same identity** across renders, and always uses the
  **latest** `when`, `message` and `confirm`.

### `NoteEditor({ note, onSave, onClose, confirm })`

- A textarea labelled `Note`, starting with `note`.
- A `Save` button (`type="button"`) calls `onSave(text)`, which returns a
  promise. When it resolves, **the text that was sent** becomes the new
  baseline (typing during the save stays unsaved). When it rejects, nothing
  becomes saved, and the rejection must not escape as an unhandled one.
- A `Close` button (`type="button"`) calls `onClose()` through the guard.
- The editor has unsaved changes when the text differs from the baseline.
  Pass `confirm` through to the hook (leave it `undefined` to use the
  default).
