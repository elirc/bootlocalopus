The payments API returns `{"id": 1283465098712340481, …}` and your code
refunds transaction `1283465098712340480`. `JSON.parse` turned the id into a
`Number`, and past `Number.MAX_SAFE_INTEGER` (2⁵³ − 1, about 9 × 10¹⁵) a
`Number` cannot hold every integer, so it silently rounded to the nearest one it
can. Twitter, Discord and most "snowflake" id schemes produce 64-bit ids that
land exactly there.

Going back is no better: `JSON.stringify({ id: 10n })` throws
`TypeError: Do not know how to serialize a BigInt`. The fix you will find on
Stack Overflow, `BigInt.prototype.toJSON = function () { return this.toString(); }`,
patches a global for every library in the process and sends the id as a
**string**, which the other side may not accept.

Node 24 has the proper tools: a `JSON.parse` reviver receives a third argument,
`context`, whose `source` is the **original text** of a primitive value; and
`JSON.rawJSON(text)` produces a value that `JSON.stringify` emits verbatim.

## Task

Export three functions.

### `parseJson(text)`

Like `JSON.parse(text)`, except that a number literal written as an integer
(an optional `-` and digits only — no `.`, no exponent) whose value is **not a
safe integer** becomes a `BigInt` of exactly those digits. Every other value is
what `JSON.parse` would produce — safe integers stay `Number`s, `1.5e300` stays a
`Number`, and digits inside **strings** stay strings. Invalid JSON throws the
same `SyntaxError` `JSON.parse` throws.

### `stringifyJson(value)`

Like `JSON.stringify(value)` (no replacer, no indentation), except that a
`BigInt` anywhere — top level, in objects, in arrays — is written as a plain
JSON number (`12345678901234567890`, no quotes). Do not modify
`BigInt.prototype` or any other global. `parseJson(stringifyJson(v))` must give
back an equal value.

### `compareIds(a, b)` → `-1`, `0` or `1`

`a` and `b` are ids as decimal strings (digits only). Compare them by numeric
value, exactly: `compareIds('9', '10')` is `-1` (a plain string comparison says
`1`), and two 19-digit ids that differ in the last digit must not compare equal.
Throw a `TypeError` if either is not a non-empty string of ASCII digits
(`BigInt('')` is `0n`, so do not rely on `BigInt` to reject bad input).
