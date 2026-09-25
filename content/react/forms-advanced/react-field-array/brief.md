"Add another guest" forms go wrong in three predictable ways:

- Rows keyed by **index**. Remove guest 1 and React reuses guest 1's `<input>`
  elements for guest 2's data. The values look right, but anything tied to
  the DOM node (focus, the caret, an IME composition, an uncontrolled field,
  a browser autofill highlight) now belongs to the wrong guest.
- **Focus** is forgotten. Click "Add guest" and focus stays on the button, so
  a keyboard user tabs back up to find the new row. Click "Remove" and the
  focused button is deleted, so focus drops to `<body>`.
- The **submitted shape** leaks UI details: row ids, empty rows the user
  never filled in, untrimmed text.

## Task

Export `GuestList({ onSubmit })`, a `<form>` that starts with **one** empty
row.

**Each row** (numbered from 1, in order)

- an input labelled `Guest <n> name` and an input labelled `Guest <n> email`
  (numbers follow the current order, so they renumber after a removal);
- a `<button type="button">` named `Remove guest <n>`.

Give every row a **stable id** when it is created (a counter in a ref, or
`crypto.randomUUID()`), and use it as the row's `key`.

**Buttons**

- `Add guest` (`type="button"`) appends an empty row and **focuses its name
  input**.
- `Remove guest <n>` removes that row, then focuses the **name input of the
  row that took its place** (the next row), or of the new last row if it was
  the last, or the `Add guest` button if no rows are left.
- A `Save` submit button.

**Submitting** calls `event.preventDefault()` and then `onSubmit(guests)`,
where `guests` is an array of `{ name, email }`, in order, with both values
**trimmed**, and rows where both are blank after trimming **left out**.
There is no other validation in this lesson.
