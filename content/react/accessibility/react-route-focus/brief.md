A full page load tells a screen reader a lot: the new page's title is read,
and focus starts at the top. A client-side route change does **none** of
that. The URL changes, the content changes, and focus stays on the link the
user clicked, if that link still exists, or drops to `<body>`. The screen
reader says nothing, and a keyboard user has to Tab through the whole header
again to reach the new content.

Two habits fix most of it: a **skip link** as the first focusable thing on
the page, and **moving focus to the new page's heading** on navigation (with
an updated `document.title`).

## Task

Export `Layout({ routeKey, title, siteName = 'Acme', nav, children })`,
which your router renders around every page. `routeKey` changes when the
route changes (think `location.pathname`).

**Markup**

```
<a href="#main-content">Skip to main content</a>     ← the first focusable element
<nav aria-label="Main">{nav}</nav>
<main id="main-content" tabIndex={-1}>
  <h1 tabIndex={-1}>{title}</h1>
  {children}
</main>
```

`tabIndex={-1}` makes `<main>` and the `<h1>` focusable from script without
adding them to the Tab order.

**Behaviour**

- Clicking the skip link calls `preventDefault()` (so a hash router does not
  treat `#main-content` as a route) and focuses `<main>`.
- `document.title` is `` `${title} · ${siteName}` `` from the first render,
  and follows `title` whenever it changes.
- When `routeKey` **changes**, focus moves to the `<h1>`.
- Not on the first render: a page that grabs focus on load fights the
  browser and any `autoFocus` field. And not when something else re-renders
  the layout: a parent render with the same `routeKey`, or a `title` that
  arrives later for the same route (`Order` becoming `Order #1042` once the
  data loads), must leave focus where the user put it.

Compare the new `routeKey` with the previous one rather than using an
"is this the first run?" flag. StrictMode runs mount effects twice in
development, so a flag is already `false` by the second run and focus jumps
on page load.
