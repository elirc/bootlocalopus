Your team owns the internal mail library, and its first API was
`sendEmail(to, subject, body, isHtml)` — positional arguments and a boolean
nobody can read at the call site (`sendEmail(u.email, 'Hi', t, true)`: true
*what*?). The new API takes one object. Someone ships it as "a small
refactor", and thirty services start sending emails with the subject
`undefined`.

Deprecating without breaking is a sequence, not a commit:

1. **Keep the old form working, with identical behaviour.** Translate it into
   the new form at the door, so there is one code path.
2. **Warn, with a stable code**, once — not on every call on a hot path.
3. **Give CI a way to fail** on deprecated usage, so teams can find their
   call sites before the old form is removed (Node's `--throw-deprecation`).
4. Remove it in the next major version. (Not today.)

## Task

`DEPRECATIONS` (code → message) is given. Export `DeprecationError` (extends
`Error`, `name` `'DeprecationError'`, a `code` property) and
`createMailer({ transport, warn, throwOnDeprecation = false })` returning
`{ sendEmail, send }`. `transport.deliver(envelope)` resolves
`{ messageId }`; both functions resolve with that `messageId`.

**The new form:** `sendEmail({ to, cc, subject, text, html })`. `to` and `cc`
are a string or an array of strings. It calls `transport.deliver` with

```js
{ to: [...], cc: [...], subject, text?, html? }
```

— `to`/`cc` always arrays (copies, `cc` defaulting to `[]`), `text`/`html`
keys present **only** when given. It rejects with a `TypeError`, delivering
nothing, when `to` is empty or missing, `subject` is not a string, or neither
`text` nor `html` was given. It never mutates the caller's object.

**The old forms still work, and produce exactly the same envelope as the
equivalent new call:**

| old usage | means | code |
| --- | --- | --- |
| `sendEmail(to, subject, body, isHtml = false)` — first argument is a string or an array | `{ to, subject, text: body }`, or `html: body` when `isHtml` | `DEP_MAIL_001` |
| a message with `body` instead of `text` | `text: body` | `DEP_MAIL_002` |
| `send(...args)` | `sendEmail(...args)` | `DEP_MAIL_003` |

A message with **both** `body` and `text` is ambiguous: reject with
`TypeError('Use either "body" or "text", not both')`.

**Warnings:** for each deprecated usage call `warn(DEPRECATIONS[code], code)`
— but only the **first** time that code is seen by this mailer. An old call
through the old name (`send('a@x.io', 'S', 'x')`) reports both codes that
apply. The new API never warns. The default `warn` (given) uses
`process.emitWarning`.

**`throwOnDeprecation: true`:** every deprecated usage, every time, rejects
with a `DeprecationError` carrying the code and delivers nothing; `warn` is
not called.

## The traps

- Two implementations (old path, new path) will drift. Normalise the
  arguments first, then run one path.
- "Warn once" is per code: remember which codes you have warned about.
- `sendEmail` is `async`, so throwing inside it rejects — which is what the
  tests expect for both `TypeError` and `DeprecationError`.
