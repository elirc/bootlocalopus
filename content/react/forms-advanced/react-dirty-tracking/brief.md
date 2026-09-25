An edit form needs to know one thing precisely: **what has the user changed
since the last save?** It decides whether "Unsaved changes" shows, whether
there is anything to send, and what goes in the `PATCH`. Most forms get it
approximately right:

- "Dirty" is set on the first keystroke and never cleared, so a field that
  was edited and then put back still counts as a change.
- The whole object is sent on every save, which overwrites a field another
  tab changed in the meantime.
- After a save resolves, the form resets its baseline to **whatever is on
  screen now**. If the user kept typing while the request was in flight,
  those later edits are marked as saved, and silently lost.
- An effect that copies the `profile` prop into state on every change wipes
  the user's edits whenever the parent re-renders with an equal, new object.

## Task

Export `ProfileForm({ profile, onSave })`. `profile` is
`{ name, email, newsletter }`; `onSave(changes)` returns a promise.

**Markup**: inputs labelled `Name` and `Email`, a checkbox labelled
`Send me the newsletter`, a `Save` submit button, a `Discard changes`
button (`type="button"`), a `<p role="status">` and a `<p role="alert">`,
both always rendered.

**The baseline** is the last saved state: `profile` on mount (and only on
mount: later `profile` props are ignored), then whatever a successful save
sent. The form is **dirty** when any field differs from the baseline.

**Status text**, in priority order:

1. `Saving…` while a save is in flight;
2. `Unsaved changes` when dirty;
3. otherwise the note from the last submit: `All changes saved` after a
   successful save, `No changes to save` after submitting a clean form, or
   empty.

**Save** (`preventDefault()` first)

- When clean, do not call `onSave`; the note becomes `No changes to save`.
- When dirty, call `onSave` with **only the changed fields**, e.g.
  `{ email: 'ada@new.dev' }`, and disable `Save` until it settles. Clear any
  previous alert.
- On success, the baseline becomes **the values that were sent**. Edits
  made while saving stay dirty.
- On failure, the baseline does not change, and the alert reads
  `Could not save your changes`.

**Discard changes** puts every field back to the baseline.
