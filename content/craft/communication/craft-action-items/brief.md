The retro ended with eleven action items. Three weeks later, two are done.
Of the rest, four have no owner ("we should…"), three say "look into" or
"think about" (so nobody can tell whether they are done), and two had a due
date that passed without anyone noticing. The same items appear, reworded,
at the next retro.

An action item is a small promise, and it only works with three parts: **one
owner**, **a date**, and **an outcome you can check**. A meeting bot that
reads the notes and flags the items missing one of them, before everyone
leaves the call, is the cheapest process improvement a team can make.

## Your task

Implement `extractActionItems(notes, { today })`. `notes` is Markdown;
`today` is `'YYYY-MM-DD'`.

**Items.** Every line that starts (after optional spaces) with `- [ ] ` or
`- [x] ` (or `- [X] `) is an action item; `x` means done. Everything else is
ignored. From the text after the box:

- `owner`: the **first** `@handle` (`@` followed by letters, digits, `_` or
  `-`), **lower-cased**, without the `@`. `null` when there is none.
- `due`: the date in the first `due YYYY-MM-DD` (`due` as a whole word, in
  any case), or `null`.
- `text`: what is left after removing that `@handle`, and the `due …` phrase
  **with its parentheses if it has them** (`(due 2024-05-10)`). Then collapse
  runs of spaces to one and trim.
- `done`: whether the box was ticked.
- `problems`: for **open** items only (a done item has `[]`), in this order:
  1. `'no-owner'`: no `@handle`.
  2. `'no-due-date'`: no `due` date; or `'bad-due-date'` when the date does
     not exist (`2024-02-30`, `2024-13-01`).
  3. `'overdue'`: the due date is **before** `today` (due today is fine).
  4. `'vague'`: `text` starts with `look into`, `investigate`, `think about`,
     `consider`, `discuss` or `follow up` (any case). Nobody can tell when
     those are done.

Return `{ items, openByOwner }`: `items` in note order, and `openByOwner`
an object mapping each owner to the `text`s of their **open** items, in note
order, with open items that have no owner under `'(unassigned)'`. Owners
with no open items do not appear.

```js
extractActionItems(`## Actions
- [ ] @Priya add a retry to the webhook consumer (due 2024-05-10)
- [x] @sam rotate the staging API key due 2024-05-02
- [ ] look into the flaky checkout test`, { today: '2024-05-06' });
// items[0] → { owner: 'priya', text: 'add a retry to the webhook consumer', due: '2024-05-10', done: false, problems: [] }
// items[2].problems → ['no-owner', 'no-due-date', 'vague']
// openByOwner → { priya: ['add a retry to the webhook consumer'], '(unassigned)': ['look into the flaky checkout test'] }
```

## The traps

- **Validate the date, not just its shape.** In Node,
  `new Date('2024-02-30')` is not `Invalid Date`: it quietly rolls over to
  1 March. Build the date with `Date.UTC(y, m - 1, d)` and check it gives
  back the same year, month and day.
- **Compare dates as `'YYYY-MM-DD'` strings**, which sort correctly, or as
  UTC dates. `new Date('2024-05-06')` versus a local-time "today" is off by
  one day in half the world.
- `@priya` and `@Priya` are the same person.
