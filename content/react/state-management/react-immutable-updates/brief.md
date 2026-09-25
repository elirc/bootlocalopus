A settings page holds nested state:

```js
{
  profile: { name: 'Ada', address: { city: 'London', zip: 'N1' } },
  notifications: {
    email: { marketing: false, security: true },
    push: { marketing: false, security: true },
  },
}
```

The reducer someone wrote:

```js
case 'set': {
  let target = state;
  for (const key of path.slice(0, -1)) target = target[key];
  target[path.at(-1)] = value;   // mutates the object React is holding
  return { ...state };
}
```

The top-level object is new, so the page re-renders. But the `email` section
is a `React.memo` component, and its `settings` prop is the **same object it
was last time**, now mutated. `memo` compares props by reference, skips the
render, and the checkbox never updates. And because the previous state was
mutated, "undo" and dev tools' history show the new value in the past too.

The rule: copy **every object on the path** from the root to the change, and
keep every object **off** the path as it is (structural sharing). Then
reference equality means "unchanged", which is what `memo`, `useMemo`
dependencies and selectors rely on.

## Task

1. Export `setIn(obj, path, value)`, returning a new object with `value` at
   `path` (an array of keys):
   - never mutates `obj` or anything inside it;
   - objects on the path are shallow copies; everything else keeps its
     identity;
   - when the value at `path` is already `Object.is`-equal to `value`,
     returns `obj` itself (no copies at all);
   - missing intermediate keys are created as plain objects;
   - arrays on the path stay arrays (a numeric key into an array copies the
     array).

2. Export `settingsReducer(state, action)` handling:
   - `{ type: 'set', path, value }`: `setIn(state, path, value)`;
   - `{ type: 'toggleAll', channel, value }`: sets every key of
     `state.notifications[channel]` to `value`. When nothing changes, return
     `state` itself; when the channel changes, the other channel keeps its
     identity.
   - unknown actions return `state`.

3. Export `NotificationSettings({ initial, onRender })`: a `useReducer` over
   `settingsReducer` rendering, for each channel in `notifications` (in key
   order), a `React.memo` section:

   ```html
   <fieldset>
     <legend>{channel}</legend>
     <label><input type="checkbox" aria-label="{channel} {key}"> {key}</label>  <!-- one per key, in key order -->
   </fieldset>
   ```

   Toggling a checkbox dispatches `set`. Export the memoised section as
   `ChannelSection({ channel, settings, dispatch, onRender })`, where
   `settings` is that channel's object. The tests count its renders:
   `NotificationSettings` passes its `onRender` prop to every section, and a
   section calls `onRender(channel)` once each time it renders, when given.
   Toggling an `email` checkbox must not re-render the `push` section.
