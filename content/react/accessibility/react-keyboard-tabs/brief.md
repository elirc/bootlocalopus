A tab strip made of buttons puts every tab in the Tab order. A keyboard user
with eight tabs presses Tab eight times to get past them to the content, and
nothing about the markup tells a screen reader that these buttons are tabs,
which one is selected, or which panel it controls.

The ARIA tabs pattern fixes both: the tablist is **one** Tab stop, and the
arrow keys move between tabs inside it. The technique is called a **roving
tabindex**: the current tab has `tabIndex={0}`, every other tab has
`tabIndex={-1}`, and the arrow keys move focus (and the `0`) from tab to tab.

## Task

Export `Tabs({ tabs, label, activation = 'automatic' })`, where `tabs` is
`[{ id, label, content }]`. The first tab starts selected.

**Structure**

- `<div role="tablist" aria-label={label}>` holding one
  `<button type="button" role="tab">` per tab, with a unique `id`,
  `aria-selected="true|false"` and `aria-controls` = its panel's id.
- One `<div role="tabpanel">` per tab, **all rendered**, with a unique `id`,
  `aria-labelledby` = its tab's id and `tabIndex={0}` (so a panel with no
  focusable content can still be reached). Every panel except the selected
  one has the `hidden` attribute.
- Roving tabindex: exactly one tab has `tabIndex` `0`, all others `-1`.

**Keyboard** (on a focused tab)

| Key | Moves focus to |
| --- | --- |
| `ArrowRight` | the next tab, wrapping from the last to the first |
| `ArrowLeft` | the previous tab, wrapping from the first to the last |
| `Home` / `End` | the first / last tab |

Moving focus moves the `tabIndex={0}` with it, so Tab out and Shift+Tab back
returns to the tab you left. Call `preventDefault()` on the keys you handle
(Home and End would otherwise scroll the page). Ignore every other key.

**Activation**

- `activation="automatic"`: moving focus with the keys also **selects** that
  tab. Right for panels that render instantly.
- `activation="manual"`: the arrows only move focus; the selection changes
  when the user activates the tab (a click, or Enter/Space, which a native
  `<button>` turns into a click). Right when showing a panel is slow.
- In both modes, clicking a tab selects it and moves the tab stop to it.
