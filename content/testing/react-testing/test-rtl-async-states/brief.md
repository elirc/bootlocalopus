A user types `ann` and presses Search, then corrects it to `anna` and
searches again. The `ann` request is slower, and it arrives **second**. The
page now shows results for `ann` under the query `anna`. The component's
tests mocked `search` with `async () => users`, which resolves at once and
always in order, so they never saw a slow request, a failure or an empty
result.

Async UI has **states** (idle, loading, error, empty, results), and
**transitions** between them that depend on the order responses arrive.
To test them you control when each promise settles.

## The component under test

`<UserSearch search={fn} />`. `search(query)` returns a promise of
`[{ id, name }]`, or rejects.

- A text field labelled **`Search users`** and a **`Search`** button
  (submitting the form).
- On submit the query is the field's text **trimmed**. A blank query does
  nothing: `search` is not called.
- While a search is pending, an element with **`role="status"`** shows
  `Loading…`.
- Results are list items (`role="listitem"`), one per user, showing the
  name.
- An empty result shows the text `No users match "<query>"`.
- A rejection shows an element with **`role="alert"`** containing
  `Something went wrong.` and a **`Retry`** button. Retry searches **the
  query that failed** again, even if the field has changed since.
- Only the **latest** search counts. If an older search settles after a
  newer one was started, whether it resolves or rejects, it is ignored.
- The loading indicator is gone once the latest search settles, whatever
  the outcome.

## Your task

Write a test file (JSX is allowed) that uses `describe` / `it` / `expect`
against the global `solution` (also available as `subject`). `render`,
`screen`, `fireEvent`, `act` and `within` are globals.

- Write **at least 7 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** but uses
  `type="search"` (role `searchbox`, not `textbox`), an `<ol>`, and other
  elements and classes. Find the field with `getByLabelText`, the button
  by role and name, and states by role and text.
- Seven planted bugs must each make at least one of your tests fail.

## The trap

With `search = async () => users`, every request resolves at once and in
order. Give each call its own **deferred** promise instead, and settle them
in the order that causes trouble: start `ann`, start `anna`, resolve
`anna`, **then** resolve (or reject) `ann`. Settle each one inside
`await act(async () => { … })` so React finishes updating before you
assert.
