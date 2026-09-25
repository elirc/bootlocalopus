Every product grows a `notify(user, message)`. Version one sends an SMS if the
user has a phone number, otherwise an email. Then come the tickets: "I got the
same 'your order shipped' text three times" (a retrying job), "you woke me at
3am about a newsletter" (no quiet hours), "I turned marketing off and still
get it", "SMS was down for an hour and nobody got anything" (no fallback),
and "we need to log every delivery for compliance" (so someone adds a
`console.log` in six places).

This boss is that function done properly, using the chapter's patterns where
they earn their place: **channels are strategies** the notifier knows only by
interface, **the clock is injected**, and **delivery events are observable**
so logging and metrics hang off the notifier instead of living inside it.

## Task

Export `DEFAULT_PREFERENCES` (given) and

```js
createNotifier({
  channels,                       // [{ id, supports(user) → boolean, send(user, message) → Promise }]
  getPreferences,                 // async (userId) → preferences | null
  clock = Date.now,               // () → epoch ms
  dedupeWindowMs = 10 * 60 * 1000,
})
```

which throws an `Error` if two channels share an `id`, and returns
`{ notify, on }`.

**Preferences** are `{ channels, quietHours, mutedTopics }`: `channels` is an
ordered list of channel ids to try, `quietHours` is `{ start, end }` in whole
UTC hours or `null`, `mutedTopics` is a list of topics. `null` means "use
`DEFAULT_PREFERENCES`", and any missing field takes its default. Load them on
**every** `notify` call (they change). If `getPreferences` rejects, `notify`
rejects with that error and sends nothing.

**`notify(user, message)`**, where `user` has an `id` and `message` is
`{ key, topic, text, urgent? }`, resolves to one of:

| result | when |
| --- | --- |
| `{ status: 'suppressed', reason: 'muted' }` | `topic` is in `mutedTopics` |
| `{ status: 'suppressed', reason: 'quiet-hours' }` | the current UTC hour of `clock()` is in the quiet range |
| `{ status: 'suppressed', reason: 'duplicate' }` | see deduplication |
| `{ status: 'sent', channel }` | a channel's `send` resolved |
| `{ status: 'undeliverable', attempted }` | no channel succeeded; `attempted` lists the ids whose `send` was called, in order |

Checked in that order. **`urgent: true` skips the mute and quiet-hours
checks** (a new-login alert is never muted), but not deduplication.

- **Quiet hours** are `start` inclusive, `end` exclusive: `{ start: 22, end:
  7 }` is quiet from 22:00 to 06:59 and **wraps past midnight**. `start ===
  end` means no quiet hours.
- **Routing:** walk the preference's `channels` in order. Skip an id that is
  not registered or whose `supports(user)` is false. Call `send`; if it
  rejects **or throws synchronously**, that channel failed — move on to the
  next one. The first success wins.
- **Deduplication** is per `user.id` + `message.key`. It is a duplicate if the
  same pair was **successfully sent** less than `dedupeWindowMs` ago (by
  `clock()`, taken when the send succeeded), **or if a `notify` for the same
  pair is still in flight**. Suppressed and undeliverable messages are not
  recorded, so they can be retried.

**Events:** `on(type, listener)` subscribes and returns an `unsubscribe()`.
Emit, with exactly these payloads:

| type | payload | when |
| --- | --- | --- |
| `'sent'` | `{ userId, key, channel }` | a channel succeeded |
| `'failed'` | `{ userId, key, channel, error }` | one channel failed (once per failure) |
| `'suppressed'` | `{ userId, key, reason }` | any suppression |
| `'undeliverable'` | `{ userId, key, attempted }` | every channel failed or none fit |

A listener that throws must not change anything: the other listeners still
run, and `notify`'s result is the same.

## The traps

- **Two calls, one message.** A job retried while the first attempt is still
  sending must not text the customer twice. `notify` awaits preferences first,
  so a "check, then later record" duplicate test lets both calls through.
  Check and reserve the key in the same synchronous step, after the last
  `await` before sending, and release it when the attempt finishes either way.
- `hour >= start && hour < end` is wrong for 22 → 7.
- Nothing in the notifier may know what `'sms'` or `'email'` is. The tests
  bring their own channels.
