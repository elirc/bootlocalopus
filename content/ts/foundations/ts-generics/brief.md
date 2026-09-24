A generic without a constraint is barely better than `any`. The interesting
work is in `extends`: expressing "a key of this object" or "anything with an
id" so the return type follows from the argument.

## Task

Export, all generic and all preserving the caller's types:

- `pluck<T, K extends keyof T>(items: T[], key: K): T[K][]`
- `indexById<T extends { id: string | number }>(items: T[]): Record<string, T>`
- `pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>`
- `sortBy<T>(items: T[], key: keyof T): T[]` — any key is accepted, and the
  return type must stay `T[]`
- `merge<A, B>(a: A, b: B): A & B`

A note on `as`. The previous lesson banned it, and at a **boundary** — turning
`unknown` input into a typed value — that ban is right: an assertion there is
an unchecked claim about data you have not seen. *Inside* a small builder whose
signature is already fully typed, like assembling a `Pick<T, K>` key by key, one
assertion on the accumulator is a normal, contained trade-off: the caller only
ever sees the checked signature.