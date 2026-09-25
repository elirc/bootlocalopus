"Is this username free?" can only be answered by the server, and the naive
version gets every part of it wrong: it asks on every keystroke, it shows
"Available" for a value the user has since changed, a slow answer for
`ada` arrives after the answer for `ada_l` and overwrites it, and pressing
Enter submits before the check has come back, so a taken name reaches the
server anyway.

## Task

Export `UsernameForm({ checkUsername, onSubmit })`.

- `checkUsername(username)` returns a promise of `true` (available) or
  `false` (taken). It may also reject (network error).
- `onSubmit({ username })` may return a promise.

**Markup**: a `<form noValidate>` with an input labelled `Username`, a
message element that is **always rendered** (empty when there is nothing to
say) and linked from the input with `aria-describedby`, and a
`Create account` submit button.

**Messages** (exact text)

| When | Message | `aria-invalid` |
| --- | --- | --- |
| empty | `Username is required` | `"true"` |
| not 3–20 characters of `a-z`, `0-9`, `_` | `Use 3–20 lowercase letters, numbers or underscores` | `"true"` |
| check pending | `Checking…` | absent |
| check says available | `Available` | absent |
| check says taken | `That username is taken` | `"true"` |
| check rejected | `Could not check the username. Try again.` | absent |

(The dash in "3–20" is an en dash, and "Checking…" ends with a single `…`
character.)

**When to check**

1. **Not while typing.** Any change to the input clears the message and
   `aria-invalid` (they described the old value). No request is made.
2. **On blur**, validate the format. If it passes, look the value up: a
   value that has been checked before shows its answer immediately with **no
   new request** (and a value whose check is still pending shows `Checking…`
   without a second request). Otherwise show `Checking…` and call
   `checkUsername`. A rejected check is **not** remembered: the next blur
   asks again.
3. A result is shown only if the input **still holds the value it was
   for**. An old answer that arrives late is ignored (but still remembered
   for later).

**Submitting** (`preventDefault()` first)

4. Validate the format; on failure show the message, focus the input, stop.
5. Otherwise wait for the check of the current value, starting it if needed
   and reusing a pending or remembered one. Show `Checking…` while waiting.
6. If the value changed while waiting, stop. If it is taken, show the
   message and focus the input. If the check failed, show the failure
   message. Only if it is available call `onSubmit({ username })` **once**.
7. A second submit while the first is still in progress (waiting for the
   check or for `onSubmit`) does nothing.
