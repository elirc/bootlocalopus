"Wait for the server to be listening", "wait for the worker's `ready`
message", "wait for this WebSocket reply": turning one event into a promise
is a five-line helper everyone writes, and it usually leaks.

```js
const ready = new Promise((resolve, reject) => {
  worker.once('ready', resolve);
  worker.once('error', reject);
});
```

When `ready` fires, the `error` listener stays attached. Wait for `ready` in
a loop and you get `MaxListenersExceededWarning`, then a heap full of stale
closures. Add a timeout with an `AbortSignal` and the listener on the
**signal** leaks too. And browser-style targets (`EventTarget`: `fetch`
streams, `AbortSignal`, `MessagePort`, `WebSocket` in Node 22+) have
`addEventListener`, not `on`.

Node ships `events.once()` for exactly this; you are writing it, because
knowing how is what lets you spot the leaky version in review.

## Task

Export `once(target, eventName, { signal, filter } = {})`, returning a
promise.

`target` is either:

- an **EventTarget** (has `addEventListener`): resolve with the **event
  object**; or
- an **emitter**: anything with `on(name, fn)` and `off(name, fn)` (Node's
  `EventEmitter` included; do not rely on it having `once`). Resolve with the
  **array of arguments** the event was emitted with, as `events.once` does.
  While waiting, an emitter `'error'` event **rejects** with the error (its
  first argument), unless you are waiting for `'error'` itself.
  `EventTarget` `'error'` events are not special.

Options:

- `filter(payload)` — only settle on an event for which it returns truthy
  (`payload` is the args array or the event object). Other events are
  ignored and you keep waiting. If `filter` throws, reject with that error.
- `signal` — if already aborted, reject with `signal.reason` and add no
  listeners at all. If it aborts later, reject with `signal.reason`.

Whichever way the promise settles (event, error, abort or a throwing
filter), **every listener you added is removed**: from the target for the
event and for `'error'`, and from the signal for `'abort'`. Only the first
matching event counts.
