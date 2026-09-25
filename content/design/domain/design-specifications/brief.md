"Free delivery for customers in the UK who are members **or** have ordered
at least three times, unless they are flagged for fraud." It starts as a
one-line boolean expression in the checkout. Then marketing wants the same
rule for the banner, the admin tool wants to list everyone who qualifies,
and support gets the ticket: *"why don't I get free delivery?"* The boolean
only knows `false`.

A **specification** turns each business rule into a small named object that
can be combined with `and`, `or` and `not`, evaluated against any candidate,
reused anywhere, and — the part that pays for itself — asked which rules
failed.

## Task

Export:

**`spec(name, predicate)`** — a leaf specification. `name` must be a
non-empty string and `predicate` a function (else `TypeError`); the
predicate's result is coerced to a boolean.

Every specification (leaf or composite) has:

| member | meaning |
| --- | --- |
| `name` | leaf: its name; `a.and(b)` → `'(a and b)'`; `a.or(b)` → `'(a or b)'`; `a.not()` → `'not a'`, using the operands' `name`s |
| `isSatisfiedBy(candidate)` | boolean |
| `explain(candidate)` | `{ satisfied, failed }` — see below |
| `and(other)`, `or(other)`, `not()` | **new** specifications; the originals are unchanged |
| `select(candidates)` | the candidates that satisfy it, in order |

**`all(...specs)`** and **`any(...specs)`** — variadic `and`/`or`, named
`'(a and b and c)'` / `'(a or b or c)'` (a single spec keeps its own name).
With no arguments, `TypeError`.

**`explain`** — `failed` is `[]` when satisfied. Otherwise:

- leaf: `[name]`;
- `and` / `all`: the `failed` lists of **every** unsatisfied child, in
  order — support needs all the reasons, not just the first;
- `or` / `any`: the `failed` lists of all children, in order;
- `not`: `[the not-spec's own name]`, e.g. `['not flagged']`.

**The business rules** — build these with `spec`, each named exactly:

| export | name | satisfied when |
| --- | --- | --- |
| `isMember` | `'member'` | `membership === 'active'` |
| `hasOrderedAtLeast(n)` | `` `ordered-at-least-${n}` `` | `orderCount >= n` |
| `livesIn(country)` | `` `lives-in-${country}` `` | `country` matches |
| `isFlagged` | `'flagged'` | `fraudFlags` is non-empty |
| `freeDelivery` | (any) | lives in `'GB'`, **and** member **or** at least 3 orders, **and not** flagged |

For a French one-time customer with a fraud flag,
`freeDelivery.explain(c).failed` must be
`['lives-in-GB', 'member', 'ordered-at-least-3', 'not flagged']`.

## The traps

- `&&` short-circuits. An `and` that stops at the first failure is correct
  for `isSatisfiedBy` and wrong for `explain`.
- A satisfied `or` explains nothing, even if one branch failed.
- Build combinators so they return new objects; a `this.children.push(...)`
  inside `and` would change a rule already used elsewhere.
