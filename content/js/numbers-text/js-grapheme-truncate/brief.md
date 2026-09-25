`text.slice(0, 20) + '…'` on a notification preview cuts a family emoji
(`👨‍👩‍👧‍👦` is **eleven** UTF-16 code units) into a lone man and a stray joiner,
turns a flag into a letter in a box, and strips the accent off a decomposed `é`.
`text.length` counts UTF-16 code units, not what a person calls a character;
`[...text]` counts code points, which is closer and still wrong for every one
of those examples.

What a user perceives as one character is a **grapheme cluster**, and
`Intl.Segmenter` with `granularity: 'grapheme'` splits text into them. The same
API with `granularity: 'word'` splits words — including in Japanese, Chinese
and Thai, which do not put spaces between them, so `text.split(' ')` cannot.

And then there are byte limits: a database column of `VARCHAR(255)` bytes, a
4 KB push-notification payload, an HTTP header. UTF-8 needs 1 to 4 bytes per
code point, so a family emoji is 25 bytes. Truncating by bytes must still
never cut inside a cluster.

## Task

Export four functions.

- `graphemeLength(text)` → the number of grapheme clusters.
- `truncate(text, max, ellipsis = '…')` → `text` unchanged if it has at most
  `max` graphemes. Otherwise keep the first `max − graphemeLength(ellipsis)`
  graphemes, remove trailing whitespace from them (`trimEnd`), and append
  `ellipsis`. Throw a `RangeError` unless `max` is an integer greater than or
  equal to `graphemeLength(ellipsis)`.
- `truncateBytes(text, maxBytes)` → the longest prefix made of **whole**
  grapheme clusters whose UTF-8 encoding is at most `maxBytes` bytes (measure
  with `TextEncoder`). No ellipsis. `maxBytes` must be a non-negative integer
  (`RangeError` otherwise).
- `countWords(text, locale)` → the number of word-like segments
  (`isWordLike`) that `Intl.Segmenter(locale, { granularity: 'word' })` finds.
  `"Don't stop — it's 3.5 miles!"` is 5 words in English; `'私は猫です。'` is 4 in
  Japanese.
