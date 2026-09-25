A store hands its state to plugins. One plugin does
`state.cart.items.push(freebie)` and the store's change detection never
notices. `Object.freeze` does not fix it: it is **shallow**, and deep-freezing
the store's state also stops the *store* from updating it.

What you want is a **read-only view**: reads see the live data, writes
through the view throw. A `Proxy` gives you that, but two details decide
whether it works in practice:

- **Identity.** If every read of `view.cart` creates a new `Proxy`, then
  `view.cart !== view.cart`. Memoised selectors, `React.memo` and `Set`
  membership all break, and every read allocates. Cache one view per target
  in a `WeakMap`, which does not keep the target alive after the store drops it.
- **Objects with internal slots.** Methods of `Date`, `Map` and class
  instances with `#private` fields check their receiver's internal slots,
  so `view.createdAt.getTime()` on a proxied `Date` throws
  `this is not a Date object`. Only wrap plain objects and arrays.

## Task

Export `readonlyView(target)` and `isReadonlyView(value)`.

`readonlyView(target)`:

- For a primitive or `null`, returns it unchanged. For a view, returns that
  same view (no double wrapping).
- For a **plain object** (prototype `Object.prototype` or `null`) or an
  **array**, returns a view. Any other object (`Date`, `Map`, class instances)
  is returned unchanged.
- Reads are **live**: a change the owner makes to `target` later is visible
  through the view.
- Reading a property whose value is a plain object or array returns a view
  of it.
- The same target always gets the same view:
  `readonlyView(obj) === readonlyView(obj)` and `view.cart === view.cart`.
- Setting, deleting, `Object.defineProperty` and `Object.setPrototypeOf`
  through a view throw a `TypeError` whose message contains the property
  name (for `setPrototypeOf`, any message). Array mutators like `push` fail
  the same way, while `map`, `filter`, `length`, spread and `for...of` work.
- One proxy rule to respect: if a property is **non-configurable and
  non-writable** on the target (for example on a frozen object), the `get`
  trap must return the actual value, or the engine throws. Return such values
  unwrapped.

`isReadonlyView(value)` returns `true` only for views this module created.
