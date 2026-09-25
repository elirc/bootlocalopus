The "⋯" actions button is on every row of every admin table, and it is
usually a `<div>` that opens a `<div>` of links on click. A keyboard user
cannot open it; if they do, focus stays on the button and the only way into
the menu is to Tab through the entire page; Escape does nothing; and when an
item is chosen, focus drops to `<body>`, so the next Tab starts from the top
of the page.

## Task

Export `MenuButton({ label, items, onSelect })`, the ARIA **menu button**
pattern. `items` is `[{ id, label, disabled? }]`; `onSelect(id)` is called
with the chosen item's id.

**Structure**

- A `<button type="button">` showing `label`, with `aria-haspopup="menu"`,
  `aria-expanded="true|false"` (always present) and, while open,
  `aria-controls` = the menu's id.
- While open, a `<ul role="menu" aria-labelledby={button id}>` of
  `<li role="menuitem" tabIndex={-1}>` items. A disabled item has
  `aria-disabled="true"`. While closed, the menu is **not rendered**.

**Opening** (focus always moves into the menu)

- Click the button: open with the **first** item focused. Click it again
  while open: close.
- `ArrowDown` on the button: open, first item focused. `ArrowUp`: open,
  **last** item focused. (Enter and Space already click a native button.)

**In the menu** (keys arrive on the focused item)

| Key | Does |
| --- | --- |
| `ArrowDown` / `ArrowUp` | next / previous item, wrapping |
| `Home` / `End` | first / last item |
| a printable character | the next item, after the current one and wrapping, whose label starts with that character (case-insensitive); nothing if none |
| `Enter`, `Space`, or a click | select: `onSelect(id)`, close, focus the button |
| `Escape` | close, focus the button |
| `Tab` | close and focus the button, **without** `preventDefault()`, so the browser's own Tab then moves on from the button |

Call `preventDefault()` on the arrows, Home, End, Enter and Space. Disabled
items **can** be focused with the keys (so the user learns they exist), but
selecting one does nothing and the menu stays open.

**Clicking elsewhere**

A `mousedown` anywhere outside the button and the menu closes it, and does
not move focus (the user is clicking something else). The trap: a
`mousedown` on the **button itself** must not count as outside. Otherwise it
closes the menu, and the click that follows opens it again.
