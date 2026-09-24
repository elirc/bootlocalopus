A suite where every test passes can still catch nothing. Take
`expect(slugify('Hello World')).toBe('hello-world')`: that input has no
accents, no punctuation runs, no leading space and nothing to truncate, so a
dozen different bugs all pass it. **A test only has value if it fails when
the code is wrong.** Code coverage cannot measure that. Mutation testing can:
plant a bug and see whether any test goes red.

That is how this lesson grades you. You write the tests. The grader runs them
against the correct `slugify`, then against a rewrite that behaves the same,
then against six versions with one bug each. Your suite has to pass the first
two and fail every one of the six.

## What `slugify` promises

`slugify(title, { maxLength = 60 } = {})` returns a URL slug:

- **Lowercase.** `'Hello World'` → `'hello-world'`.
- **Accents folded.** Accented Latin letters become their base letter:
  `'Café Crème'` → `'cafe-creme'`.
- **Separators collapsed.** Every run of characters that are not `a–z` or
  `0–9` becomes **one** dash: `'rock & roll'` → `'rock-roll'`.
- **Trimmed.** The slug never starts or ends with a dash: `'  -Hello!- '` →
  `'hello'`.
- **Truncated at a word boundary.** If the slug is longer than `maxLength`,
  it is cut after the last *whole word* that fits, and never ends on a dash.
  `slugify('one two three', { maxLength: 9 })` → `'one-two'`, not
  `'one-two-t'`. A single word longer than `maxLength` is cut at
  `maxLength`.
- **Empty in, empty out.** An empty title, or one with only spaces or
  punctuation, returns `''`. It returns a string, never `undefined`.

## Your task

Write a test file that uses `describe` / `it` / `expect` against the global
`solution` (also available as `subject`), e.g.
`expect(solution.slugify('A b')).toBe('a-b')`.

- Write **at least 6 tests**. Each one must make an assertion: a test that
  asserts nothing fails even against the correct code.
- The suite must pass against a **rewrite that behaves the same**. That
  version splits the title into words and joins them back together instead of
  using the same regexes. So test inputs and outputs only: check the returned
  string, never how it was built.
- Every one of the six planted bugs must make at least one of your tests fail.

## The trap

The obvious input fails in the same way for many bugs, and a bug slips through
whenever no test feeds it the input that exposes it. Go through the list
above one bullet at a time. For each bullet, pick an input whose output would
be *different* if that rule were broken. `'hello'` shows nothing about
trimming. `'  hello  '` does.
