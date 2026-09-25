Half the flaky tests in this suite go through one shared helper:

```js
await sleep(timeoutMs);
return check();
```

It waits a fixed time and checks once. On a fast laptop that wastes the
whole timeout on every call; on a loaded CI runner the thing it waits for
lands 10 ms after the single check, and the test fails. The fix is not a
bigger number. It is to **poll a condition**: check now, and if it is not
true yet, check again shortly, until it is true or a deadline passes. That is
what Testing Library's `waitFor` and Playwright's auto-waiting do.

## Your task

Rewrite `waitFor(check, options)` in the starter. Options, all optional:
`timeoutMs` (default `1000`), `intervalMs` (default `50`), `now` (a function
returning milliseconds, default `Date.now`) and `sleep` (`(ms) => Promise`,
default a real `setTimeout`). The tests inject `now` and `sleep` with a fake
clock, so **read the time only through `now()` and wait only through
`sleep()`**.

- Call `check()` **straight away**, and `await` it: it may be async.
- A check **passes when it does not throw or reject**. `waitFor` then
  resolves with whatever it returned, even `false` or `undefined`.
- A check that throws or rejects means "not yet". Sleep `intervalMs`, then
  check again. Never run two checks at once.
- The deadline is `timeoutMs` after the call started. **Never sleep past it**:
  if less than `intervalMs` is left, sleep only what is left. After the last
  sleep, check **once more at the deadline**. A condition that comes true
  exactly then passes.
- When a check fails and the deadline has been reached, reject with an
  `Error` whose message is exactly
  `` `waitFor timed out after ${timeoutMs}ms: ${lastError.message}` `` and
  whose `cause` is the last error.
- `timeoutMs: 0` means check exactly once, and never sleep.

With `timeoutMs: 200, intervalMs: 50`, a check that never passes runs at
0, 50, 100, 150 and 200 ms (five checks, four sleeps of 50). With
`timeoutMs: 120`, it sleeps 50, 50, then 20.

## The trap

`waitFor(() => count === 3)` returns at once with `false`: the check did not
throw, so it passed. That is how the real Testing Library behaves too, and it
is the most common misuse of it. Checks should *assert*
(`expect(count).toBe(3)`), and that is why the rule here is "does not throw"
rather than "is truthy".

The other trap is the message. A timeout that says only "timed out" sends
whoever reads the CI log back to reproduce it. Carry the last real failure
("expected 3, received 2") in the message and as `cause`.
