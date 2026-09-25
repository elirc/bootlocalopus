Click a tab whose data is not loaded yet and the panel the user was reading
disappears, replaced by a spinner, then the new panel pops in. On a fast
connection that is a flash; on a slow one it is a blank screen for a second
on every click. The content was fine. Nothing needed to go away.

A state update inside `startTransition` tells React this update is not
urgent: if rendering it suspends, React **keeps the current UI on screen**
and finishes the switch in the background, instead of falling back to the
nearest `<Suspense>` boundary. `useTransition` also gives you `isPending`,
so you can say something is happening without throwing the old content away.

## Task

`TabbedView({ tabs, renderPanel, label })` works but flashes the fallback on
every switch. `tabs` is `[{ id, label }]`; `renderPanel(id)` returns an element
that **suspends** until that tab's data has loaded.

Keep the structure the starter has (a `role="tablist"` labelled by `label`,
one `role="tab"` button per tab with `aria-selected`, and a `role="tabpanel"`
holding `<Suspense fallback={<p>Loading…</p>}>{renderPanel(active)}</Suspense>`)
and change the behaviour:

- The **first** load still shows `Loading…`: there is nothing to keep.
- Clicking a tab that is still loading keeps the **current panel** visible,
  with no `Loading…`, until the new panel can render.
- While a switch is pending, the tablist has `aria-busy="true"`. When nothing
  is pending, `aria-busy` is absent (or `"false"`).
- `aria-selected` moves to the new tab **when its panel appears**, not on
  click. A selected tab must describe the panel that is actually showing.
- A tab whose panel is already loaded switches straight away.
- If the user clicks Photos and then Settings before Photos loads, the view
  ends on Settings, whichever loads first.

The fix is a few lines. The point is knowing which update to mark, and what
React does differently when you do.
