The admin table sorted "Age" as `10, 102, 9`. Sorting descending
reshuffled people with the same team, so the list jumped around on every
click. After a refactor, screen readers stopped announcing the sort order.
The tests clicked a header and checked that the **first** row changed.
That is true of every one of those bugs.

To test a data table you need **data built to expose each rule**: numbers
where text order and numeric order differ, names that differ only in case,
**ties**, and a filter that matches in some columns and not others. Then
compare the **whole order**, not only the first row.

## The component under test

`<SortableTable columns rows />`. `columns` is
`[{ key, label, type: 'text' | 'number' }]`, and `rows` is
`[{ id, ...values }]`.

- A text field labelled **`Filter`**. It keeps the rows where any **text**
  column contains the filter text, **ignoring case** and surrounding spaces.
- An element with **`role="status"`** says `Showing <shown> of <total>`,
  where `total` is **all** rows, before filtering.
- With no rows left, the table body shows `No matching rows`.
- Each column header contains a **button named by the column label**.
  - The first click on a column sorts **ascending**, the next
    **descending**, then ascending again.
  - Clicking a **different** column always starts that column
    **ascending**.
  - `number` columns sort numerically. `text` columns sort
    alphabetically, **ignoring case**.
  - **Ties keep their original order**, in **both** directions.
- The sorted column's header cell (`columnheader`) has
  **`aria-sort="ascending"`** or `"descending"`. Other headers have no
  `aria-sort`, or `"none"`.

## Your task

Write a test file (JSX is allowed) that uses `describe` / `it` / `expect`
against the global `solution` (also available as `subject`). `render`,
`screen`, `fireEvent` and `within` are globals.

- Write **at least 8 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** but adds
  hidden arrow icons to the header buttons, sets `aria-sort="none"` on
  unsorted headers, and uses a search-type filter field. Find buttons by
  role and name, read rows through `getAllByRole('row')` and
  `getAllByRole('cell')`, and treat a missing `aria-sort` as `"none"`.
- Eight planted bugs must each make at least one of your tests fail.

## The trap

With rows `Ann 30, Bob 40, Cid 50`, every sort bug gives the right answer.
Use ages such as `9, 10, 102`, names such as `bea` and `Bob`, and two people
in the same team **in a known order**. Then sort that team column
descending and check the tied rows are still in their original order.
