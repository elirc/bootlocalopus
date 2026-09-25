An FAQ built from `<div onClick>` headers looks fine and is invisible to half
your users: a keyboard cannot reach it, and a screen reader announces
"Shipping times" as plain text with no hint that it opens anything. The fix
is not a pile of ARIA on a div. It is a real `<button>` that says whether its
section is open.

## Task

Export `Accordion({ items, allowMultiple = false })`, where `items` is
`[{ id, title, content }]`. For each item render:

```
<h3>
  <button type="button" id={…} aria-expanded="true|false" aria-controls={panel id}>
    {title}
  </button>
</h3>
<div role="region" id={…} aria-labelledby={button id} hidden={!open}>
  {content}
</div>
```

- Every section starts **collapsed**. Clicking a header toggles its section
  (a native button also handles Enter and Space for you).
- `aria-expanded` is the string `"true"` or `"false"`, always present.
- The panel is **always in the DOM** so `aria-controls` points at something;
  a collapsed panel has the `hidden` attribute, an open one does not.
- With `allowMultiple` false, opening a section closes the one that was
  open. With `allowMultiple` true, sections open and close independently.
- **Ids must be unique on the page.** Two accordions may render items with
  the same `id`s (an FAQ on the page and one in a drawer, say), so an id built
  from `item.id` alone collides. Use `useId()` as a prefix.
- The accordion may sit inside a `<form>`: opening a section must not submit
  it. A `<button>` without a `type` is a submit button.
