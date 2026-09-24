`this` is decided by **how a function is called**, not where it was written.
Pull a method off its object and `this` is gone.

## Task

`Cart.addAll` and `Cart.describe` below are both broken by exactly this
problem. Fix them **without** changing `add` or the shape of the class, and
without switching `items` to a global.

```js
cart.addAll([{ price: 5 }, { price: 6 }]);  // currently throws
[1, 2].map(cart.describe);                  // currently throws
```