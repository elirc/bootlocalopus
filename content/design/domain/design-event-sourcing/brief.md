Gift cards are stored as a row with a `balance` column, updated in place.
A customer writes in: "my card had £100, now it has £40, I only spent £20".
Nobody can tell what happened, because the row only knows the answer, not
the history. And two browser tabs checking out at once both read £100, both
spend £60, and the card ends at £40 with £120 spent.

**Event sourcing** stores the history instead: a stream of facts per card
(`CardIssued`, `CardRedeemed`, …), never edited, and the balance is **derived**
by folding over them. Three small pure functions carry the whole idea, plus a
store that refuses to append on top of a history you did not see
(**optimistic concurrency**).

```
command ─▶ decide(state, command) ─▶ new events ─▶ store.append(id, events, expectedVersion)
                  ▲
state = rehydrate(store.load(id).events)   // events.reduce(evolve, null)
```

## Task

Export `DomainError` (`name` `'DomainError'`, a `code`) and
`ConcurrencyError` (`name` `'ConcurrencyError'`,
constructor `(streamId, expectedVersion, actualVersion)`), then:

**`evolve(state, event)`** — pure; returns a new state and never mutates the
old one. State is `null` before `CardIssued`, then an object with **at least**
`{ cardId, balanceMinor, frozen }` plus whatever you need to track (for
example, how much each order redeemed and refunded). Unknown event types
return the state unchanged.

| event | effect |
| --- | --- |
| `{ type: 'CardIssued', cardId, amountMinor }` | new card, balance `amountMinor`, not frozen |
| `{ type: 'CardRedeemed', orderId, amountMinor }` | balance goes down |
| `{ type: 'CardRefunded', orderId, amountMinor }` | balance goes up |
| `{ type: 'CardFrozen', reason }` | frozen |

**`rehydrate(events)`** — the fold, starting from `null`. Events written by
the old version of this code store `amount` instead of `amountMinor` on
`CardRedeemed` and `CardRefunded`; history cannot be rewritten, so
**upcast** them as you read.

**`decide(state, command)`** — pure; returns the events to record (possibly
`[]`), or throws a `DomainError`:

| command | rules → events |
| --- | --- |
| `{ type: 'Issue', cardId, amountMinor }` | card already exists → `ALREADY_ISSUED`; amount not a positive integer → `INVALID_AMOUNT`; else `[CardIssued]` |
| any other command on `null` | `NOT_FOUND` |
| `{ type: 'Redeem', orderId, amountMinor }` | this `orderId` already redeemed → `[]` (a retried request); frozen → `CARD_FROZEN`; bad amount → `INVALID_AMOUNT`; more than the balance → `INSUFFICIENT_FUNDS`; else `[CardRedeemed]` |
| `{ type: 'Refund', orderId, amountMinor }` | order never redeemed → `UNKNOWN_ORDER`; bad amount → `INVALID_AMOUNT`; total refunded for that order would exceed what it redeemed → `REFUND_EXCEEDS_REDEMPTION`; else `[CardRefunded]` (allowed on a frozen card) |
| `{ type: 'Freeze', reason }` | already frozen → `[]`; else `[CardFrozen]` |

Events have exactly the fields in the first table.

**`createEventStore()`** → `{ load(streamId), append(streamId, events, expectedVersion) }`,
both async. `load` resolves `{ events, version }` where `version` is the
number of events (0 for an unknown stream). `append` rejects with
`ConcurrencyError` — writing nothing — unless `expectedVersion` equals the
current version. Stored history must not change when the caller later
modifies the arrays or objects it passed in or got back.

**`createGiftCardService(store, { maxAttempts = 3 } = {})`** →
`{ handle(cardId, command) }`: load, rehydrate, decide, append with the loaded
version, and resolve `{ events, state }` (the new events and the state after
them). No new events → append nothing. On `ConcurrencyError`, **start again
from the load** (someone else changed the card; decide again on the new
state), up to `maxAttempts` attempts in total, then reject with the
`ConcurrencyError`. Any other error rejects at once.

## The traps

- Retrying the **append** with the same events after a conflict is exactly
  the double-spend you are preventing. Re-load and re-decide.
- `{ ...state, balanceMinor }` copies the top level only. If you track orders
  in a nested object, copy that level too when you change it.
