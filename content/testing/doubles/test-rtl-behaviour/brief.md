`container.querySelector('.like-btn')` and `expect(state.liked).toBe(true)`
break when a designer renames a class, and they pass while a keyboard user is
stuck inside a dialog. Component tests are worth having when they do what a
user does: find controls by **role and name**, click and type, and assert on
what is on screen and where focus is. Then a refactor that changes the markup
does not break them, and a real regression does.

This is the chapter boss. You get two components from the React track and
write the tests for both in one file.

## What the components promise

**`<LikeButton initialLikes initialLiked save />`** is an optimistic toggle.
`save(nextLiked)` returns a promise.

- The button's accessible name is `Like`, or `Unlike` when liked. The count
  is shown in the element with `data-testid="count"`.
- A click updates the label and count **immediately**, then calls
  `save(nextLiked)` once.
- While a save is in flight the button is **disabled**, so a second click
  does not call `save` again.
- If `save` **rejects**, the label and count go back to what they were, and
  an **alert** (`role="alert"`) says `Could not save. Try again.`
- The next click clears the alert, and it stays gone if that save succeeds.

**`<Modal open onClose title>{children}</Modal>`**

- Renders nothing when `open` is false. When open, it is a **dialog** whose
  accessible name is `title`.
- On open, **focus moves into the dialog**.
- The `Close` button calls `onClose`, and so does **Escape** pressed anywhere
  in the document.
- When the dialog closes, **focus returns** to whatever was focused before it
  opened.

## Your task

Write a test file (JSX is allowed) that uses `describe` / `it` / `expect`
against the global `solution` (also available as `subject`), e.g.
`render(<solution.LikeButton … />)`. `React`, `render`, `screen`,
`fireEvent`, `act`, `waitFor` and `within` are globals. There are **no
jest-dom matchers**, so assert on `textContent`, `.disabled` and
`document.activeElement` directly.

- Write **at least 8 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** but uses a
  reducer, different elements, different class names, extra wrappers, an
  `<h3>` instead of an `<h2>`, and a `<section>` as the dialog. So query by
  role and accessible name (`getByRole('button', { name: 'Like' })`,
  `getByRole('dialog', { name: 'Settings' })`) or by the `data-testid` in the
  contract, never by tag, class or heading level.
- Five planted bugs must each make at least one of your tests fail.

## The trap

With a `save` that resolves straight away, the in-flight state lasts one
microtask, so neither the disabled button nor a rollback can be seen. Give
`save` a **deferred promise**: keep its `resolve` and `reject` functions,
assert on the in-between state, then settle it inside
`await act(async () => { … })`.

For focus, render the modal from a small wrapper that has a real trigger
button. Focus the trigger, open the modal, close it, and check that
`document.activeElement` is the trigger again.
