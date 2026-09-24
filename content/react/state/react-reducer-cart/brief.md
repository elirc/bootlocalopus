`useReducer` wins when updates involve several fields at once, or when the
next state depends on the previous in a non-trivial way. The reducer is a pure
function, so it is trivially testable — which is why this lesson tests it
directly as well as through the UI.

## Task

Export both a pure `cartReducer(state, action)` and a `Cart({ catalogue })`
component.

State: `{ lines: [{ id, name, price, qty }] }`.

Actions:

- `{ type: 'add', item }` — append with `qty: 1`, or increment if already present
- `{ type: 'remove', id }`
- `{ type: 'setQty', id, qty }` — a qty of 0 or less removes the line
- `{ type: 'clear' }`
- an unknown action returns the **same state object** (reference equality)

The reducer must never mutate its input.

`Cart` renders an `Add <name>` button per catalogue item, a list item per line
reading ````Widget x2 — $19.98```` (price × qty, 2 decimals), and a total
````Total: $19.98````. Empty cart shows `Your cart is empty`.

Each line also has a `Remove <name>` button (e.g. `Remove Widget`) that
dispatches `remove`, and there is one `Clear` button that empties the cart.

(Prices here are float dollars to keep the lesson about the reducer. Real money
belongs in integer cents, as in the SQL track: `0.1 + 0.2` is not `0.3`.)