The usual `useLocalStorage` is `useState` plus a write in an effect. It works
until two components read the same key: the header's theme toggle writes
`"dark"`, and the settings page, which read `"light"` on mount, never finds
out. Nor does anything notice when the user changes the setting in another
tab.

`localStorage` is an **external store** — state React does not own. React's
tool for reading one is `useSyncExternalStore(subscribe, getSnapshot)`:
React calls `getSnapshot` on every render, and re-renders whenever
`subscribe`'s callback fires and the snapshot changed.

The trap: `getSnapshot` must return the **same value** while the store has not
changed (it is compared with `Object.is`). Return `JSON.parse(...)` from it and
every call produces a new object, so React thinks the store is always
changing and bails out with "The result of getSnapshot should be cached".
Return the raw string, and parse it separately with `useMemo`.

## Task

Export `useLocalStorage(key, initialValue)` returning `[value, setValue, remove]`:

- `value` is `JSON.parse` of `localStorage.getItem(key)`; if the key is
  missing **or** holds invalid JSON, it is `initialValue`. Like `useState`'s
  initial value, `initialValue` is the one passed on the **first** render.
- `value` must keep the **same identity** across re-renders while storage is
  unchanged (callers put it in dependency arrays).
- `setValue(next)` stores `JSON.stringify(next)`. `setValue(fn)` calls `fn`
  with the **currently stored** value, so two updater calls in a row both
  apply. Every mounted component using that key re-renders with the new
  value.
- `remove()` removes the key; readers fall back to their `initialValue`.
- a `storage` event on `window` (which the browser fires when **another tab**
  changes storage) updates readers of that key.
- `setValue` and `remove` are stable across renders (for the same `key`).
- nothing is left subscribed after unmount.

The browser does not fire `storage` in the tab that made the change, so you
need your own way to notify same-tab readers (a module-level `Set` of
listeners is enough).
