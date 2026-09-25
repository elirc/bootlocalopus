A to-do app shows the list in the order the user dragged it into. There's
also a "Top priorities" panel that calls `prioritise(tasks)`. After the panel
renders, the main list has reordered itself, because `prioritise` called
`tasks.sort()` on the array it was given. Every test of `prioritise` passed.
They all checked the value it **returned**. None of them looked at the value
they **passed in**.

A side effect is behaviour too. When a function promises not to change its
input, test that promise directly, in one of two ways:

- **Snapshot and compare.** Take `structuredClone(input)` before the call,
  and afterwards `expect(input).toEqual(snapshot)`.
- **Deep-freeze the input.** Test files are ES modules, so they run in
  strict mode, and writing to a frozen object there **throws** instead of
  silently doing nothing. That points you straight at the line that
  mutates. Freeze the array **and** every object inside it.

## The functions under test

A task is `{ id, title, priority, due, done }`. `priority` is `'high'`,
`'medium'` or `'low'`. `due` is an ISO date such as `'2024-05-01'`, or the
key is missing when there is no due date. `done` is a boolean.

`prioritise(tasks)` returns a **new** array in display order:

1. open tasks before done tasks;
2. then `high`, `medium`, `low`;
3. then earliest `due` first, with tasks that have **no due date last**;
4. tasks that tie on all of that keep their **input order**. It is a stable
   sort, so there is no alphabetical tiebreak.

`completeTask(tasks, id)` returns a **new** array in which task `id` is
replaced by a copy with `done: true`. An unknown id changes nothing.

Neither function may change the input array or any task object in it.

## Your task

Write a test file that uses `describe` / `it` / `expect` against the global
`solution` (also available as `subject`).

- Write **at least 6 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** (a
  decorate-sort-undecorate with explicit sort keys).
- Six planted bugs must each make at least one of your tests fail.

## The trap

Three of the bugs return exactly the right value. You can only see them
by looking at the input after the call. For ordering, build inputs where
**one** rule decides between two tasks. If three rules all agree on the
order, the test can't tell which one the code actually used.
