Drag and drop is the only way to reorder most lists on the web, which means
a keyboard user, a switch user or someone with a tremor cannot reorder them
at all. WCAG 2.2 made it explicit (2.5.7 Dragging Movements): anything you
can do by dragging needs a single-pointer alternative. The usual one is a
pair of **Move up / Move down** buttons per row.

Buttons alone are half the job. Press "Move Bread up" and the row jumps, and
then:

- nothing tells a screen reader user where it went;
- if Bread is now first, the button they pressed is **disabled**, and a
  focused element that becomes disabled drops focus to `<body>`. Their
  place in the page is gone.

## Task

Export `ReorderList({ items, onChange, label })`. It is **controlled**:
`items` is `[{ id, label }]`, and a move calls `onChange(newItems)` with a
**new** array (never mutate `items`). The parent passes the new array back.

**Markup**

- `<ul aria-label={label}>` with one `<li>` per item, showing its `label`.
- In each row, two `<button type="button">`s with accessible names
  `Move <label> up` and `Move <label> down` (visible text can be an arrow,
  with the name in `aria-label`). The first row's **up** and the last row's
  **down** are `disabled`.
- A `<div role="status">` that is always rendered.

**Moving**

- **Move up** swaps the item with the one above it; **Move down** with the
  one below.
- The status reads `Moved <label> to position <n> of <total>` (1-based).
- After the parent re-renders with the new order, focus is on the **same
  button of the moved item**, so pressing it again keeps moving the same
  item. If that button is now disabled (the item reached the top or the
  bottom), focus the item's **other** button instead.
