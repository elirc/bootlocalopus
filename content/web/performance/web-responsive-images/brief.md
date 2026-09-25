Images are most of the bytes on most pages, and the `<img>` tag decides how
many of them a phone downloads. The usual mistakes:

- **No `srcset`**: a 390 px-wide phone downloads the 2400 px desktop hero.
- **`srcset` without `sizes`**: the browser assumes the image is `100vw`
  wide, so a thumbnail in a 3-column grid still gets the big file.
- **`sizes` in the wrong order**: the browser uses the **first** media
  condition that matches. `(min-width: 640px) 50vw, (min-width: 1024px) 33vw`
  never reaches the second entry, because every 1024 px viewport is also at
  least 640 px.
- **Upscaled candidates**: listing `2400w` for a 1200 px original makes the
  CDN serve a blurry, bigger file.
- **No `width` and `height`**: the page jumps when the image arrives (layout
  shift). With both attributes the browser reserves the right box from the
  aspect ratio.
- **`loading="lazy"` on the hero**: the most important image on the page
  waits until layout proves it is in view. It hurts LCP directly.

## Task

Export `imageAttributes(options)` returning a plain object of `<img>`
attributes. Options:

- `src` — the original's URL (absolute, may already have a query string).
  Candidate URLs are `src` with a `w` query parameter **set** to the width
  (use `URL` and `searchParams.set`, keeping the other parameters).
- `widths` — candidate widths. Each must be a positive integer, or throw a
  `TypeError`. Deduplicate, sort ascending, and drop widths **greater** than
  `intrinsic.width`; if none are left, use `[intrinsic.width]`.
- `intrinsic` — `{ width, height }` of the original.
- `slots` — optional, `[{ minViewport, width }]`: from `minViewport` px up,
  the image is displayed `width` wide. `width` is a number (px) or a CSS
  length string used as-is (`'33vw'`, `'calc(100vw - 32px)'`).
- `fallbackWidth` — optional, default `'100vw'`, same format as `width`.
- `alt` — must be a string (`''` is fine: a decorative image), or throw a
  `TypeError`.
- `priority` — optional boolean: this is the LCP image.

Return:

- `src`: the candidate URL for the smallest remaining width that is **at
  least 800**, or the largest one if none is;
- `srcset`: `` `${url} ${w}w` `` for every remaining width, ascending, joined
  with `', '`;
- `sizes`: the slots sorted by `minViewport` **descending**, each as
  `(min-width: <minViewport>px) <width>`, then the fallback, joined with
  `', '` (a number `n` is written `<n>px`);
- `width` and `height`: the intrinsic ones;
- `alt`;
- with `priority`: `loading: 'eager'` and `fetchpriority: 'high'`;
  without: `loading: 'lazy'` and `decoding: 'async'`.
