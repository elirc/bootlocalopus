The country picker passed its tests: type `fra`, click `France`, and the
value is `France`. Keyboard users had a different experience. ArrowDown
went nowhere after the last option. The screen reader never announced
which option was highlighted. Enter picked the first country even when
nothing was highlighted. Typing after a highlight left an invisible
selection on a different country, and Escape wiped the text when the user
only wanted to close the list.

A combobox is the hardest common widget to get right, and its contract is
precise: the **ARIA 1.2 combobox pattern**. This boss asks for a suite that
pins it down through the DOM alone.

## The component under test

`<Combobox label options onSelect />`. `options` is `[{ id, label }]`.

- The input has role **`combobox`** and is named by `label`. It has
  **`aria-expanded`** `"true"` exactly when the list of options is shown,
  and `"false"` otherwise.
- **Typing** filters the options: the label must **contain** the trimmed
  text, **ignoring case**. It opens the list (role **`listbox`**, one
  **`option`** per match) and **clears any highlight**. If nothing matches,
  no listbox is shown, and an element with `role="status"` says
  `No results`.
- **ArrowDown** opens the list if it's closed and moves the highlight down,
  starting at the first option and **wrapping** from the last to the
  first. **ArrowUp** moves it up, starting at (and wrapping to) the last.
- The highlighted option has **`aria-selected="true"`** (the others
  `"false"`), and the input's **`aria-activedescendant`** is that option's
  `id`. DOM focus **stays in the input**. When nothing is highlighted, the
  input has no `aria-activedescendant`.
- **Enter** with an option highlighted **chooses** it. **Enter** with
  nothing highlighted does **nothing**.
- **Clicking** an option chooses it.
- **Choosing** sets the input's value to the option's label, **closes** the
  list, and calls **`onSelect(option)`** once, with the option object.
- **Escape** with the list open **closes** it and keeps the text. Escape
  with the list closed **clears** the text.

## Your task

Write a test file (JSX is allowed) that uses `describe` / `it` / `expect`
against the global `solution` (also available as `subject`). `render`,
`screen`, `fireEvent` and `within` are globals.

- Write **at least 10 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** but names
  the input with `aria-labelledby`, renders options as `<div>`s with other
  ids, and keeps a hidden listbox mounted while closed. Query by role
  (`getByRole('combobox', { name })`, `queryByRole('listbox')`), and find
  the highlighted option by following `aria-activedescendant` with
  `document.getElementById`.
- Nine planted bugs must each make at least one of your tests fail.

## The trap

Each keyboard test needs **three** checks: which option has
`aria-selected="true"`, that `aria-activedescendant` points at **that
same option**, and that `document.activeElement` is still the input. Test
the edges: wrapping at the bottom, Enter before any arrow key, typing
after a highlight, and Escape pressed twice.
