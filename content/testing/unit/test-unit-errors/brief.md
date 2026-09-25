This test is green:

```js
expect(() => parsePrice('abc')).toThrow();
```

It stays green when `parsePrice` has a bug that makes it crash with
`TypeError: Cannot read properties of null`. The checkout form catches
`PriceError` to show "Please enter a valid price". It doesn't catch a
`TypeError`, so the user gets a blank page. The test asked *whether*
something was thrown. It never asked *what*.

An error path is behaviour like any other, and callers depend on its
details: the **class** they catch, and the **code** they branch on. Assert
on those, and leave the message alone. The message is prose that people
reword.

## The function under test

`parsePrice(text)` turns what a user typed into **integer pence**.

- Accepted: digits with an optional `£` in front and up to two decimals.
  `"12"` → `1200`, `"12.5"` → `1250`, `"£12.50"` → `1250`,
  `" 7.05 "` → `705` (surrounding whitespace is ignored).
- Thousands separators are optional, but must group by three:
  `"1,234.56"` → `123456`.
- Bad input throws a **`PriceError`** (exported as `solution.PriceError`)
  whose **`code`** says why:

| code | when | examples |
| --- | --- | --- |
| `EMPTY` | blank after trimming | `""`, `"   "` |
| `NEGATIVE` | a minus sign | `"-5"`, `"£-5"` |
| `PRECISION` | more than two decimals | `"12.345"` |
| `FORMAT` | anything else unparsable | `"abc"`, `"12."`, `"1,23.45"` |

- A non-string argument is a programming error, not bad user input. It
  throws a plain **`TypeError`**, not a `PriceError`.

## Your task

Write a test file that uses `describe` / `it` / `expect` against the global
`solution` (also available as `subject`).

- Write **at least 7 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** but has
  different messages. Assert on the class and the `code`, never the message.
- Seven planted bugs must each make at least one of your tests fail.

`toThrow` takes a class (`toThrow(solution.PriceError)`) or an object whose
properties the error must have (`toThrow({ code: 'EMPTY' })`).

## The trap

Three of the bugs throw an error where the contract says an error is thrown,
just the **wrong one**. A test that only checks that something was thrown
cannot see them.
