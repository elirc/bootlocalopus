"Why did this re-render?" is the first question of every React performance
investigation, and guessing is how you end up with `useMemo` on everything.
The React DevTools Profiler can answer it ("Why did this render?" in its
settings), but it is worth being able to build the answer yourself, because
building it teaches you the rule `memo` actually follows: **every prop is
compared with `Object.is`**. A new object with the same contents is a
different prop. So is a new arrow function.

## Task

Export two functions.

### `diffProps(prev, next)`

Compare two props objects and return an array of `{ prop, reason }`, **sorted
by `prop`** (plain string order), with one entry per prop that differs:

| `reason` | when |
| --- | --- |
| `'added'` | the key is in `next` but not in `prev` |
| `'removed'` | the key is in `prev` but not in `next` |
| `'new-function'` | both values are functions and they are not the same function |
| `'new-reference'` | both are non-null objects (arrays included), not the same object, but **shallowly equal**: both arrays or both non-arrays, the same own keys, and every value `Object.is`-equal |
| `'changed'` | any other pair of values that are not `Object.is`-equal |

A key that is present with the value `undefined` counts as present. `NaN` is
equal to `NaN` (that is what `Object.is` says). Identical props give `[]`.

Shallow means one level: `{ address: { city } }` against a copy whose
`address` is a different object is `'changed'`, because memo would see a
different value there too.

### `useWhyRender(name, props, report)`

A hook a component calls with its own props. On every **re-render** (not the
first render), call `report(name, diffProps(previousProps, props))`, where
`previousProps` are the props of the **previous** render.

- Report **after the render has committed**, not during render: a render
  React throws away should never be reported, and when `report` runs the DOM
  already shows the render it is explaining.
- Report every re-render, including ones where nothing changed. `[]` is the
  most useful answer this tool gives: "a parent re-rendered and passed
  identical props", which is exactly the render `memo` would skip.
