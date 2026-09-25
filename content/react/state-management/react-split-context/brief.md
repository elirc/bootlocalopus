A toast system is the textbook case for context: any button anywhere calls
`show('Saved')`, and one viewport renders the list. The first version puts
everything in one context:

```jsx
<ToastContext.Provider value={{ toasts, show, dismiss }}>
```

Every render of the provider creates a new `value` object, so **every
component that reads the context re-renders on every toast**, including the
hundreds of buttons that only ever call `show`. Memoising the value does not
help: it still changes whenever `toasts` changes.

The fix is to split what changes from what does not. State goes in one
context; the actions, created once and never replaced, go in another.
Components that only act subscribe only to the actions.

## Task

Export:

- `ToastProvider({ children })` holding the list of toasts.
- `useToasts()` returning the current array of toasts, oldest first. Each
  toast is `{ id, message }`.
- `useToastActions()` returning `{ show, dismiss }`:
  - `show(message)` appends a toast and **returns its `id`**. Ids are unique
    within a provider (a counter is fine; `Date.now()` is not: two toasts in
    the same millisecond collide).
  - `dismiss(id)` removes that toast; an unknown id does nothing.
  - the returned object is **the same object on every render** of the
    provider, for its whole lifetime, and so are `show` and `dismiss`.
- A component that calls only `useToastActions()` must **not re-render** when
  toasts are shown or dismissed.
- Outside a provider, `useToasts()` throws
  `Error('useToasts must be used within a ToastProvider')` and
  `useToastActions()` throws
  `Error('useToastActions must be used within a ToastProvider')`. (A silent
  default value turns a missing provider into a confusing `undefined is not a
  function` far away from the cause.)
- `show` and `dismiss` can be called several times in one event handler, and
  every call applies.
