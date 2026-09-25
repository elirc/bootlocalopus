The API snapshot test fails on every run, because the response contains a
fresh UUID and `createdAt: new Date()`. So someone runs the update command on
every PR, and the day a real change lands in the snapshot (a field
disappears, an API key starts leaking into the body) it is approved along
with the noise. A snapshot that changes on every run is not a test.

Snapshot and approval testing only work on **deterministic** output. The
standard fix is a *serializer* that scrubs the values that legitimately
change between runs and keeps everything else, so the diff shows only real
changes. Two details make it worth having. The same UUID must get the **same**
placeholder everywhere, so the snapshot still proves that
`order.customerId` points at `customer.id`. And keys are sorted, so moving a
property in the code does not change the snapshot.

## Your task

Implement `scrub(value, { redact = [] } = {})`. It returns a scrubbed **deep
copy** and never modifies its input.

- **Timestamps.** A string that is **entirely** an ISO 8601 timestamp becomes
  `'<timestamp>'`: `YYYY-MM-DDTHH:MM:SS`, optional fractional seconds of any
  length, then `Z` or an offset like `+01:00`. A `Date` object also becomes
  `'<timestamp>'`. A bare date (`'2024-05-01'`), or a timestamp inside longer
  text, is left alone.
- **UUIDs.** Every UUID (`8-4-4-4-12` hex digits, any case), **including
  one inside a longer string** like `'/orders/<uuid>'`, becomes
  `'<uuid-N>'`. N counts distinct UUIDs from 1, **in order of first
  appearance**, and the same UUID (compared case-insensitively) always gets
  the same N. Numbering starts at 1 again on every call.
- **Order.** Object keys in the output are **sorted** (`Object.keys(o).sort()`)
  at every depth, and the traversal visits them in that sorted order, so
  sorted order is also what "first appearance" means. Array order is kept.
- **Redaction.** A key listed in `redact`, at any depth, gets the value
  `'<redacted>'`, whatever its value was (even `null` or an object). Nothing
  inside a redacted value is visited, so its UUIDs are not numbered.
- Everything else (numbers, booleans, `null`, other strings) is copied as is.
  The top-level value can be an object, an array or a string.

## The trap

Numbering in the order you *happen* to meet UUIDs is not stable if that order
depends on key insertion order: `{ z: A, a: B }` and `{ a: B, z: A }` must
give the same snapshot. Sort the keys **before** you walk into them, not after
you have built the output. And redact by checking the key before descending,
or an API key's UUID will already have taken `<uuid-1>`.
