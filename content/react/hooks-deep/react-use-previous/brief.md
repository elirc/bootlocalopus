The `usePrevious` you find in most snippets writes to a ref **during render**:

```jsx
const ref = useRef();
const previous = ref.current;
ref.current = value; // mutation during render
return previous;
```

Render is supposed to be pure. React is allowed to call your component more
than once for one commit (StrictMode does exactly that in development, and
concurrent rendering can throw a render away). The second call reads the value
the first call just wrote, and "previous" quietly becomes "current". Write refs
in an effect, after React has committed.

There is a second, subtler trap: "the value at the previous render" is not
"the value before the last change". If the parent re-renders for an unrelated
reason, the previous render's value equals the current one.

## Task

Export three things from your module:

1. `usePrevious(value)` — returns the value from the **previous committed
   render**, `undefined` on the first render. It must work under
   `<React.StrictMode>`, so update the ref in an effect, not during render.

2. `useLatest(value)` — returns a ref object whose `.current` is always the
   value from the most recent commit. The ref object itself must be the same
   object on every render (callbacks and timers hold on to it). Update it in
   `useLayoutEffect` so it is current before any passive effect runs.

3. `PriceTicker({ price })` renders:
   - `<span data-testid="price">{price}</span>`
   - `<span data-testid="trend">…</span>` containing `up` if the most recent
     **change** of `price` was an increase, `down` if it was a decrease, and
     the empty string before the price has ever changed.

   Re-rendering with the **same** price must keep the last trend (a ticker
   that flickers back to blank whenever its parent re-renders is a bug). This
   is exactly where a naive `usePrevious` gives the wrong answer.
