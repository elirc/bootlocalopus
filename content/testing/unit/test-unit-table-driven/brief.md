A config file says `timeout: "250ms"`, the parser reads it as `null`, and the
service falls back to its default of 30 seconds. Nobody notices until a
downstream call hangs for 30 seconds in production. The parser had tests:
`"1h30m"` and `"90s"`. Nobody had written down the other twenty inputs a
parser like this sees.

A **table-driven test** puts the cases in an array of `[input, expected]`
rows and loops over it, registering one `it` per row. Adding a case costs one
line, a reviewer can see at a glance which inputs are missing, and each row
still fails on its own with its own name:

```js
const valid = [
  ['1h30m', 5_400_000],
  ['90s', 90_000],
];
for (const [input, ms] of valid) {
  it(`parses ${JSON.stringify(input)}`, () => {
    expect(solution.parseDuration(input)).toBe(ms);
  });
}
```

## The function under test

`parseDuration(text)` turns a duration string into **milliseconds**.

- A duration is one or more parts, each a **whole number** followed by a
  unit: `h` (hours), `m` (minutes), `s` (seconds) or `ms` (milliseconds).
  Parts are written with no spaces between them: `1h30m`, `2m15s`, `250ms`,
  `1h2m3s4ms`.
- Units must appear **largest first**, and **each at most once**.
- Units are **case-insensitive** (`1H30M` is fine), and whitespace around
  the whole string is ignored.
- Anything else returns **`null`**. That includes an empty or blank string,
  junk before or after the parts, a fraction (`1.5h`), a sign (`-5s`), and a
  unit with no number.

## Your task

Write a test file that uses `describe` / `it` / `expect` against the global
`solution` (also available as `subject`).

- Write **at least 8 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** (one
  anchored regular expression instead of a tokenizer loop).
- Seven planted bugs must each make at least one of your tests fail.

## The trap

The happy path passes against almost every bug here. The bugs show up on
the inputs that should be **rejected**, so the table of `null` rows matters
as much as the table of valid ones. Assert `toBe(null)`: `toBeFalsy()` also
accepts `0`.
