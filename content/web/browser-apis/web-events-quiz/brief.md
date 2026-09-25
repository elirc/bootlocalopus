Most DOM event bugs are not about which event to listen for. They are about
**where** the listener sits and **when** it runs:

- An event travels in three phases: **capture** (from `window` down to the
  target), **target**, then **bubble** (back up). `addEventListener` listens
  in the bubble phase unless you pass `{ capture: true }`.
- `event.target` is the element that was actually clicked — possibly an icon
  inside your button. `event.currentTarget` is the element whose listener is
  running, and it is `null` once the handler has returned.
- A listener you cannot remove is a leak. `removeEventListener` needs the
  **same function** and the same `capture` flag; an `AbortSignal` passed as
  `{ signal }` removes any number of listeners at once.

These questions are the situations you will actually debug.
