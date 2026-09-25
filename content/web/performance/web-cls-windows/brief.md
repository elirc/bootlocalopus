Your RUM dashboard shows CLS 0.31 for the product page, Lighthouse says 0.02,
and nobody can explain the difference. The explanation is in how CLS is
computed from raw `layout-shift` entries — and in which shifts count at all.

- A shift within **500 ms of user input** (typing, clicking, tapping) is
  expected and is excluded: the entry has `hadRecentInput: true`. (Scrolling
  is not input.)
- Shifts are grouped into **session windows**. A shift joins the current
  window if it happens **less than 1 second** after the previous shift **and**
  less than **5 seconds** after the window's first shift; otherwise it starts
  a new window.
- CLS is the **largest** window's total — not the sum of every shift on the
  page. Summing everything is how long-lived pages (an infinite feed, an SPA
  open all day) used to reach CLS 3.0.

Lighthouse only watches the page load. Field data sees the late banner that
pushes the "Add to cart" button down 20 seconds in.

## Task

Export `cumulativeLayoutShift(entries)`. Each entry is
`{ value, startTime, hadRecentInput, target }` (`startTime` in ms,
`target` a selector string for the element that moved the most). Entries
may arrive **out of order**: sort a copy by `startTime` first. Ignore entries
with `hadRecentInput: true` entirely (they neither add to a window nor extend
one).

Return the worst window as
`{ value, start, end, count, largestTarget }`:

- `value`: the window's total;
- `start` / `end`: `startTime` of its first and last shift;
- `count`: how many shifts it has;
- `largestTarget`: the `target` of its single largest shift (the first one on
  a tie) — where to start fixing.

If two windows have the same total, return the **earlier** one. With no
counted shifts, return `{ value: 0, start: null, end: null, count: 0, largestTarget: null }`.
Do not round `value`.
