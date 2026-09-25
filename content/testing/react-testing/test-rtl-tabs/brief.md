The settings page's tabs looked right and worked with a mouse. A keyboard
user pressed Tab and had to go through all six tab buttons before reaching
the form. The arrow keys moved focus but didn't switch the panel. Pressing
ArrowRight on the last tab did nothing, and on one account it landed on a
disabled tab. The component's tests clicked each tab and checked the
panel text.

Accessible widgets have a keyboard contract (the WAI-ARIA Authoring
Practices spell it out), and it is testable with `fireEvent.keyDown`,
`document.activeElement` and ARIA attributes. Tests written this way also
survive markup changes, because they query by **role and name**.

## The component under test

`<Tabs label tabs defaultTab? onChange? />`, where `tabs` is an array of
`{ id, label, content, disabled? }`.

- A **`tablist`** named `label`, containing one **`tab`** per entry, named
  by its `label`.
- Exactly one tab is selected: it has `aria-selected="true"` and the others
  `"false"`. The selected tab is the first enabled one, unless `defaultTab`
  says otherwise.
- The selected tab's content is shown in a **`tabpanel`** whose accessible
  **name is the tab's label**. Other panels are not shown.
- **Roving tabindex**: the selected tab has `tabIndex` `0`, every other tab
  `-1`, so Tab moves into the tablist once and then out of it.
- Clicking an enabled tab selects it.
- With focus on a tab: **ArrowRight** and **ArrowLeft** move to the
  next or previous **enabled** tab, **wrapping around** at the ends.
  **Home** and **End** go to the first and last enabled tab. Each of these
  moves **focus and selection** together (automatic activation).
- **Disabled** tabs are never selected, not by clicking and not by the
  keyboard: the keyboard skips them.
- `onChange(id)` is called when the selection **changes**, and not when
  the already-selected tab is clicked.

## Your task

Write a test file (JSX is allowed) that uses `describe` / `it` / `expect`
against the global `solution` (also available as `subject`). `render`,
`screen`, `fireEvent` and `within` are globals.

- Write **at least 7 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** but uses
  a `<ul>`, renders every panel with the `hidden` attribute on inactive
  ones, and names panels with `aria-label`. `getByRole` ignores hidden
  elements, so query panels with
  `getByRole('tabpanel', { name: 'Billing' })`, and not with
  `querySelector` or by following `aria-labelledby`.
- Seven planted bugs must each make at least one of your tests fail.

## The trap

After an arrow key, check **two** things: the new tab has
`aria-selected="true"`, **and** it is `document.activeElement`. One without
the other is a different, broken widget. Put a disabled tab **between**
two enabled ones, and start from the **last** tab when you test wrapping.
