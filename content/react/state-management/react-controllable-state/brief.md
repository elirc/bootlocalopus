Every reusable component eventually gets both requests: "just let it manage
its own open state" and "I need to control which panel is open from the URL".
The usual first attempt copies the prop into state:

```jsx
const [openId, setOpenId] = useState(props.openId);
useEffect(() => setOpenId(props.openId), [props.openId]);
```

Now there are **two sources of truth**. The component changes its copy
without asking, so a parent that says "no" (a form with unsaved changes
refusing to switch panels) is ignored, and every parent update renders one
frame of the old value before the effect catches up.

The pattern design systems use instead: a component is **controlled** when
the parent passes a value, and then it never keeps its own copy; it is
**uncontrolled** when the parent does not, and then it owns the state. Either
way, it reports changes through a callback.

## Task

1. Export `useControllableState({ value, defaultValue, onChange })` returning
   `[state, setState]`:
   - **controlled** when `value !== undefined` (checked on every render):
     `state` is `value`, and `setState(next)` only calls `onChange(next)`;
     nothing changes until the parent passes a new `value`.
   - **uncontrolled** otherwise: `state` starts at `defaultValue` and
     `setState(next)` updates it **and** calls `onChange(next)`.
   - `setState` accepts a value or an updater `(prev) => next`, where `prev`
     is the current state (controlled or not). In uncontrolled mode, two
     updater calls in one event handler must both apply, as with `useState`
     (and `onChange` is called with each result).
   - if `next` is `Object.is`-equal to the current state, do nothing: no
     `onChange` call.
   - `onChange` is optional, and `setState` is **stable** across renders
     (while calling the latest `onChange`).

2. Export `Accordion({ items, openId, defaultOpenId = null, onOpenChange })`,
   built on the hook, where `items` is `[{ id, title, content }]` and at most
   one item is open. For each item render:

   ```html
   <h3><button aria-expanded="true|false" aria-controls="{panelId}">{title}</button></h3>
   <div role="region" id="{panelId}" aria-label="{title}">{content}</div>  <!-- only when open -->
   ```

   Clicking a closed item's button opens it (`onOpenChange(id)`); clicking the
   open one closes it (`onOpenChange(null)`). Panel ids must be unique on the
   page (use `useId`).
