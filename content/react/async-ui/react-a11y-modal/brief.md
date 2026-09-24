A `<div className="modal">` is not a dialog. Keyboard users cannot escape
it, screen readers do not announce it, and focus is left wherever it was.

## Task

Export `Modal({ open, onClose, title, children })`:

- renders nothing when `open` is false
- when open, renders a `<div role="dialog">` with `aria-modal="true"` and
  `aria-labelledby` pointing at the `<h2>` that holds `title`
- a `Close` button calls `onClose`
- pressing **Escape** anywhere calls `onClose`
- on open, focus moves to the dialog
- on close, focus returns to whatever was focused before it opened

Clean up the key listener when the modal closes or unmounts.

Parents pass `onClose` inline, so it is a new function on every render. A
re-render of the parent while the dialog is open (typing into a field inside
it, say) must **not** move focus: the user stays where they tabbed to.

This covers the basics, not a complete dialog. A production modal also traps
Tab inside the dialog and makes the page behind it inert (`inert` attribute, or
the native `<dialog>` element with `showModal()`, which does both for you).