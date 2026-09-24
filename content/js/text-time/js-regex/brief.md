In July 2019 one regular expression in a WAF rule, `.*(?:.*=.*)`, pinned every
CPU at Cloudflare for 27 minutes. In 2016 Stack Overflow went down because a
line of whitespace hit `\s+$`. The pattern in both cases *worked* — on every
input anyone had tried. A backtracking engine tries every way a pattern can
match before it gives up, and nested quantifiers like `(x+)+` have
exponentially many ways. One hostile string, one event loop, frozen.

The other ways regexes rot are duller: positional groups (`m[7]`) that break
when someone adds a group, a `g` flag that keeps state between calls, `.` in a
search term that matches any character, and `\p{Emoji}` counting the digit `3`
as an emoji.

## Task

Export four functions.

### `parseLogLine(line)` → object or `null`

Parse one line in the Combined Log Format:

```
203.0.113.7 - alice [10/Oct/2025:13:55:36 +0200] "GET /api/orders?page=2 HTTP/1.1" 200 2326 "https://shop.example/cart" "Mozilla/5.0 (X11; Linux x86_64)"
```

into exactly this shape:

```js
{
  ip: '203.0.113.7',                  // IPv4 or IPv6 (e.g. '2001:db8::1')
  user: 'alice',                      // '-' becomes null
  time: '2025-10-10T11:55:36.000Z',   // the timestamp converted to UTC, as toISOString()
  method: 'GET',                      // one or more uppercase letters
  path: '/api/orders?page=2',
  protocol: 'HTTP/1.1',
  status: 200,                        // a number; always exactly three digits
  bytes: 2326,                        // a number; '-' becomes 0
  referrer: 'https://shop.example/cart',  // '-' becomes null
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', // '-' becomes null
}
```

Months are the English abbreviations `Jan` … `Dec`; the offset is `±HHMM`.
Return `null` for any line that does not match the format **in full** — a
truncated line, trailing junk, a two-digit status, an unknown month. Use named
groups (`(?<status>\d{3})` and `match.groups.status`), not `m[9]`. Calling it
many times with the same line must give the same answer every time.

### `isSlug(value)` → boolean

A slug is one or more runs of lowercase ASCII letters and digits, joined by
**single** hyphens: `hello`, `2025-roadmap`, `a1-b2-c3`. No leading or trailing
hyphen, no `--`, no uppercase, no accents, no underscores or spaces. A
non-string is not a slug.

The validator in production today is

```js
const SLUG = /^([a-z0-9]+-?)+$/;
```

which accepts `'abc-'` and, on `'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!'`, runs for
minutes. Yours must reject a hostile input of any length in well under
**2 seconds** (the grader times inputs of growing length and fails you as soon
as the time starts to explode) — and must still accept a valid slug 100,000
characters long.

### `countEmoji(text)` → number

How many emoji a person would count in `text`. A thumbs-up with a skin tone
(`👍🏽`), a family joined with zero-width joiners (`👨‍👩‍👧`), a flag (`🇬🇧`) and a
keycap (`1️⃣`) are **one** emoji each. Plain digits, `#`, `*` and a text-style
`©` are **zero**. The `v` flag's `\p{RGI_Emoji}` matches exactly this set of
sequences; `\p{Emoji}` (a per-code-point property) does not.

### `highlight(text, term)` → string

Wrap every case-insensitive occurrence of `term` in `<mark>…</mark>`, keeping
the original text's casing:

```js
highlight('A+B and a+b', 'a+b')   // '<mark>A+B</mark> and <mark>a+b</mark>'
highlight('$5.00 or 5x00', '5.00') // '$<mark>5.00</mark> or 5x00'
```

`term` is user input: `.`, `+`, `(`, `[` and friends are literal characters.
Node 24 has `RegExp.escape` for exactly this. An empty `term` returns `text`
unchanged. Occurrences do not overlap (`highlight('aaa', 'aa')` is
`'<mark>aa</mark>a'`).
