React escapes every string you render, so `{user.bio}` is safe. The XSS bugs
in React apps live in the escape hatches: `dangerouslySetInnerHTML` fed by a
"tiny markdown helper" that builds HTML strings, and `href={user.website}`,
which React happily renders as `javascript:alert(document.cookie)`.

## Task

Users may write a bio with a very small markdown subset. Render it with React
elements only: **no `dangerouslySetInnerHTML`, no `innerHTML`**. (The grader
checks that every element in your output was created by React.)

Export `safeHref(raw)`:

- parse with `new URL(raw)` (no base URL); if it throws, or `raw` is not a
  string, return `null`
- allow only the protocols `http:`, `https:` and `mailto:`; return the parsed
  URL's `href` (so `https://ada.dev` becomes `https://ada.dev/`)
- everything else — `javascript:` in any casing or with smuggled whitespace,
  `data:`, `vbscript:`, relative and protocol-relative URLs — returns `null`

Export `Bio({ text })`, rendering a single root element (`<p>` or `<div>`)
whose content is only text, `<strong>`, `<a>` and `<br>`:

| Syntax | Renders |
| --- | --- |
| `**bold**` (non-empty, on one line) | `<strong>bold</strong>` |
| `[label](url)` (url has no spaces or `)`) | `<a href={safeHref(url)} target="_blank" rel="noopener noreferrer">label</a>` |
| a newline `\n` | `<br>` |
| anything else | plain text, exactly as written |

- If `safeHref(url)` is `null`, render **only the label** as plain text: no
  `<a>` at all (an `<a>` without `href` still looks clickable).
- The label and the bold text are plain text: no nesting.
- Unmatched syntax stays literal: `**not bold` renders as `**not bold`.
- HTML in the input is text. `<script>alert(1)</script>` shows up on screen as
  those characters, which is correct.

The grader feeds a payload corpus (event-handler attributes, `<script>`,
`<svg onload>`, obfuscated `javascript:` links, `data:` URLs, quote-breaking
hrefs) and asserts the DOM has **no `on*` attribute**, no element other than
the allowed four, and no `href` whose protocol is not `http:`, `https:` or
`mailto:`. It also checks the legitimate cases render: bold, links, line breaks.

Why `rel="noopener noreferrer"`: a page opened with `target="_blank"` can
otherwise reach back through `window.opener` and navigate your tab to a
phishing copy ("reverse tabnabbing"), and it receives your URL as the referrer.
