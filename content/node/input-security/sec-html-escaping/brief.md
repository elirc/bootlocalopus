React escapes for you. The HTML your **server** builds — transactional emails,
an admin export, a status page, an error page that echoes the URL — does not.
`` `<p>${comment.body}</p>` `` with a body of `<img src=x onerror=…>` is stored
XSS, and it runs in the origin that holds your users' sessions.

The fix is not "sanitise the input" (you do not know, at input time, whether a
string will end up in HTML, SQL, a CSV or a shell). It is **escape on output**,
by default, everywhere — and make not-escaping the thing you have to ask for
by name. That is what a tagged template can do:

```js
html`<p>${userText}</p>`       // escaped
html`<ul>${items.map(li)}</ul>` // nested html`` results are trusted, not double-escaped
raw(trustedMarkup)              // the explicit, greppable opt-out
```

Escaping is necessary but not sufficient for URLs: `href="javascript:alert(1)"`
contains nothing to escape. Links get a scheme **allowlist** too — and it must
use a real URL parser, because `JaVaScRiPt:`, ` javascript:` and
`java<TAB>script:` all run in a browser.

## Task

Export `class SafeHtml` whose constructor takes a string and stores it as
`this.value`, with `toString()` returning it.

Export the tag `html(strings, ...values)` returning a `SafeHtml` whose value
is the literal parts with each value inserted as follows:

- a `SafeHtml` (checked with `instanceof`) → its value, unchanged;
- an array → each element by these same rules (recursively), joined with `''`;
- `null`, `undefined` or `false` → `''` (so `${cond && html`…`}` works); `0`
  is `'0'`;
- anything else → `String(value)`, escaped: `&` → `&amp;`, `<` → `&lt;`,
  `>` → `&gt;`, `"` → `&quot;`, `'` → `&#39;` (escape `&` first).

Export `raw(string)` → `new SafeHtml(String(string))`.

Export `safeUrl(url)`: if `url` is a string that `new URL(url, 'http://base.invalid')`
parses with protocol `http:`, `https:` or `mailto:`, return `url` unchanged
(the `html` tag will still escape it); otherwise return `'#'`.

Export `renderComment({ author, body, website })` returning a `SafeHtml` of
exactly:

```html
<article class="comment"><h3><a href="WEBSITE" rel="nofollow ugc">AUTHOR</a></h3><p>BODY</p></article>
```

with `WEBSITE` being `safeUrl(website)`. When `website` is `undefined`, `null`
or `''`, there is no link: `<h3>AUTHOR</h3>`. All three values are escaped.
Always quote attributes: escaping does nothing for `<a href=${x}>`.
