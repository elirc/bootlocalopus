"Saved!" toasts vanished while users were still reading them, because
hovering didn't pause the timer. Error toasts vanished too, so people
missed that their payment had failed. After a busy session, the page
slowed down: every dismissed toast left its `setTimeout` running. The
tests used real timers with a 5-second wait, so they were marked `.skip`
long ago.

You can't test timing by waiting for it. The component takes an injected
**`schedule(fn, ms)`** that returns a **cancel** function. The app passes
one built on `setTimeout`, and your tests pass a **fake** that only records
timers. You fire them when you want and check which ones were cancelled.

## The components under test

`<ToastProvider schedule? children />` and `useToast()`, which returns
`notify(message, { kind })` where `kind` is `'info'` (default) or
`'error'`.

- Each toast is an element with `role="status"` (info) or **`role="alert"`**
  (error) containing the message and a button named **`Dismiss`**.
- An **info** toast schedules its removal: `schedule(fn, 5000)`
  (`solution.AUTO_DISMISS_MS`). When that timer fires, the toast goes.
- An **error** toast is **never** scheduled. It stays until dismissed.
- **Dismiss** removes the toast at once and **cancels** its timer.
- **Pointer over a toast** (`mouseenter`) **cancels** its timer. **Leaving**
  (`mouseleave`) schedules a **fresh** 5000 ms timer (info toasts only).
- At most **3** toasts are shown (`solution.MAX_TOASTS`). A 4th removes the
  **oldest** one and cancels that one's timer.
- When the provider unmounts, every pending timer is **cancelled**.

## Your task

Write a test file (JSX is allowed) that uses `describe` / `it` / `expect`
against the global `solution` (also available as `subject`). `render`,
`screen`, `fireEvent`, `act` and `within` are globals. The starter has a
fake scheduler and a small component that calls `notify`.

- Write **at least 7 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same**, where each
  toast is a `<li>` whose own effect owns its timer. Query toasts by role
  and message, and count timers that are **live** (neither fired nor
  cancelled), not every `schedule` call ever made.
- Eight planted bugs must each make at least one of your tests fail.

## The trap

"The toast disappeared after I fired the timer" doesn't prove the timer
was right. Also check the **delay** it was scheduled with, and check what
is left **live** after dismissing, hovering, overflowing and unmounting. A
leaked timer is invisible on screen. Only your fake scheduler can see it.
Fire timers inside `act(() => { … })`.
