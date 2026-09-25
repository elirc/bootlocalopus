The mobile app's tests mock the orders API. The orders API's tests check the
orders API. Both suites are green on the day the backend renames
`totalCents` to `total`, and the app shows "£NaN" to every customer. Each
side tested against its own **assumption** of the other.

A **consumer-driven contract** closes that gap. The consumer writes down what
it actually reads (field names, types, formats) and the provider's CI checks
its real responses against it. The contract is loose on purpose: it says
"a number" where the consumer does not care which number, and it ignores
fields the consumer never reads, so the provider can still add fields and
change values freely. Tools like Pact are built on a small set of matchers.
You will write the matching engine.

## Your task

The starter exports three matcher constructors you can use as they are:
`like(example)`, `eachLike(example, { min = 1 })` and
`term(regex, example)`. Implement `verify(contract, actual)`. It returns an
array of mismatch strings, in contract order (depth first), or `[]`.

**Rules**

- **Literal** (string, number, boolean, `null`): outside `like`, `actual`
  must be `===` to it.
- **`like(example)`**: from here down, literals match **any value of the same
  type**. Objects and arrays inside it still follow their own rules.
- **Plain object**: `actual` must be an object. Every key of the contract must
  be present (`Object.hasOwn`; a key set to `undefined` counts as present) and
  match. **Extra keys in `actual` are fine.**
- **Array literal** (`[1, 'a']`): `actual` must be an array of the **same
  length**, matched item by item.
- **`eachLike(example, { min })`**: `actual` must be an array with at least
  `min` items, and **every** item must match `example` by type.
- **`term(regex, example)`**: `actual` must be a string and `regex.test(actual)`
  must be true.

**Types** are named `string`, `number`, `boolean`, `null`, `array`, `object`
and `undefined`.

**Paths** start at `$`, add `.key` for a key and `[i]` for an array index:
`$.lines[1].qty`.

**Messages**, exactly:

| Problem | Message |
| --- | --- |
| wrong type | `$.totalCents: expected number, got string` |
| wrong literal | `$.status: expected "paid", got "pending"` (both `JSON.stringify`d) |
| missing key | `$.customer.email: missing` |
| array literal length | `$.pair: expected 2 item(s), got 3` |
| eachLike too short | `$.lines: expected at least 1 item(s), got 0` |
| term mismatch | `$.id: "ORD-812" does not match /^ord_[0-9]+$/` (the value `JSON.stringify`d, then the regex as a string) |

When a value has the wrong type, report only that: do not go on to check its
keys or items. A term given a non-string, or an `eachLike` given a
non-array, is a wrong-type problem too.

## The trap

Two failure modes pull in opposite directions. A strict matcher (a deep
`toEqual` on a recorded response) breaks the provider's build every time it
adds a field or a test fixture changes a value, so people stop running it.
A lax one (only checking `typeof body === 'object'`) passes the rename. The
rules above are the middle: **fail on what the consumer reads, ignore
everything else.** Keep `byType` as a flag you pass down the recursion. It is
what makes `like({ customer: { email: 'a@b' } })` accept any email.
