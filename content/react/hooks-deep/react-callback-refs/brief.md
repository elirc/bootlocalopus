`useRef` + `useEffect(() => ref.current.focus(), [])` focuses an element that
exists on mount. It does nothing for an element that appears **later** — the
input that replaces a label when you click "Edit" — because the effect ran
once, when `ref.current` was still `null`.

A **callback ref** is a function React calls with the DOM node when it is
attached, and with `null` when it is detached. It runs at exactly the moment
you care about, whenever that is.

Callback refs are also how you give one element **two** refs: your
component needs its own ref, and it forwards one to the parent. Pass
`ref={merged}` where `merged` writes the node to both. Build it with
`useCallback`: an unstable callback ref is detached (`null`) and re-attached
on every render, which re-runs any logic in it.

## Task

1. Export `useMergedRef(...refs)` returning a callback ref that, when called
   with a node (or `null`), passes it to every ref: object refs get
   `ref.current = node`, function refs are called with `node`. `null` and
   `undefined` entries are skipped. The returned function must keep its
   identity while the refs passed in are the same.

2. Export `InlineEdit({ value, onSave })`:
   - At rest: `<span>{value}</span>` and a button named `Edit`.
   - Clicking `Edit` replaces both with an `<input>` whose accessible name is
     `Edit value` (use `aria-label`), pre-filled with `value`, **focused**,
     and with its text **selected**.
   - `Enter` in the input calls `onSave(draft)` and returns to rest;
     `Escape` returns to rest without saving.
   - Returning to rest moves focus back to the `Edit` button (the keyboard
     user was in the input; do not drop them on `<body>`).
   - Do **not** move focus on first mount. A component that steals focus when
     the page loads is a bug.
