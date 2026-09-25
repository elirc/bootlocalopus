`rows.map(parse).filter(valid).slice(0, 20)` over a 200,000-line export
parses all 200,000 lines to keep 20. Lazy iteration fixes that, but hand-rolled
lazy wrappers tend to have three bugs:

1. **One-shot.** The wrapper grabs `source[Symbol.iterator]()` in its
   constructor, so the second `for...of` over it yields nothing.
2. **Over-pulling.** `take(3)` reads a fourth item before noticing it has
   enough. When each item is a database row or a network page, that is real
   work (or a real side effect).
3. **Leaking.** Stopping early never calls the source iterator's `return()`,
   so a generator's `finally` (closing a file, releasing a cursor) never runs.

An **iterable** is anything with a `[Symbol.iterator]()` method that returns a
fresh **iterator** (`{ next(), return?() }`). `for...of`, spread and
destructuring call `return()` for you when they stop early — and so does a
generator function when it stops early while iterating something else.

## Task

Export a class `Seq`:

- `static from(iterable)` — wraps any iterable (array, `Set`, generator
  object, custom iterable). Does not read from it.
- `[Symbol.iterator]()` — makes the `Seq` itself iterable, so `for...of` and
  `[...seq]` work. Iterating a `Seq` twice gives the same items again when the
  source can be iterated again (like an array).
- `map(fn)` and `filter(fn)` — return a **new** `Seq`; `fn` receives
  `(value, index)`, where `index` counts the items that reached this step.
  The original `Seq` is unchanged.
- `take(n)` — a new `Seq` of at most the first `n` items. It must pull
  **exactly** as many items from upstream as it yields — never one extra —
  and `take(0)` pulls nothing at all.
- `first()` — the first item, or `undefined` if there is none. Pulls one item.
- `toArray()` — collects into an array.

Everything is lazy: nothing is read and no callback runs until something
iterates. Whenever consumption stops early (`take` reaches `n`, `first()`,
or a `break` in the caller's `for...of`), the source iterator must be closed
so its `finally` runs.

Generator functions (`function*`) are the idiomatic way to write this.
