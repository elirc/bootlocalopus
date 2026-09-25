`fetch` looks like "call a URL, get data". It is really a low-level primitive
with defaults that surprise people for years: it resolves on a `500`, follows
redirects silently, leaves cookies behind on cross-origin calls, and hands you
a body you can read exactly once.

These questions are the situations that turn into "it works on my machine"
tickets. Each explanation says what the browser actually does, and what the
bug looks like when it ships.
