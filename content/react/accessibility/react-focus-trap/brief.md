The modal lesson moved focus into a dialog and back out. It did not stop
**Tab**: press it a few times and focus walks out of the dialog into the page
behind it, which a sighted user cannot see and a screen reader user is now
lost in. A modal dialog, a slide-over panel and a full-screen mobile menu all
need the same thing: a **focus trap**.

(Modern browsers can do this natively with `<dialog>.showModal()` or the
`inert` attribute on everything else. A trap in JavaScript is still what most
component libraries ship, and knowing how it works is how you debug theirs.)

## Task

Export `FocusTrap({ active = true, initialFocusRef, children })`. It renders
one `<div tabIndex={-1}>` around `children`.

**Tabbable elements** are the descendants matching
`a[href], button, input, select, textarea, [tabindex]`, **except** those that
are `disabled`, have `tabindex="-1"`, are `input[type="hidden"]`, or sit
inside an element with the `hidden` attribute. Work them out **when a key is
pressed**, not once on mount: the content of a dialog changes (an error
message with a Retry button appears, a step of a form is added).

**When the trap becomes active** (mounted with `active`, or `active` changes
from `false` to `true`):

1. remember the element that had focus;
2. focus `initialFocusRef.current` if given, otherwise the first tabbable
   element, otherwise the container itself.

**While active**, on `keydown` of `Tab` inside the trap:

- `Tab` on the **last** tabbable element (or on the container itself)
  focuses the **first** and calls `preventDefault()`;
- `Shift+Tab` on the **first** tabbable element (or on the container)
  focuses the **last** and calls `preventDefault()`;
- with no tabbable elements at all, focus stays on the container and the
  key's default is prevented;
- anywhere else, do **nothing**: let the browser move focus normally.
  Preventing every Tab and moving focus yourself breaks the order in subtle
  ways and is not needed.

**When it stops being active** (`active` becomes `false`, or it unmounts
while active): move focus back to the remembered element, if it is still in
the document. When `active` is `false` the component traps nothing and never
moves focus.

**The trap:** do this in `useEffect`, not `useLayoutEffect`. A layout
effect's cleanup runs in the middle of React's commit, and React then puts
focus back where it was before the commit. On unmount that goes unnoticed
(the focused element is gone); on deactivation your hand-back is silently
undone.
