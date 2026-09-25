Resource hints are the cheapest performance win there is, and the easiest to
get wrong in ways that make the page **slower**:

- A font preload without `crossorigin` is **wasted**: fonts are always
  fetched in CORS mode, the preload is not, so the browser downloads the font
  twice.
- A `preconnect` without `crossorigin` warms up the wrong connection for
  fonts and `fetch()` calls. CORS and non-CORS requests use **separate**
  connection pools.
- Preloading an image's `src` when the `<img>` has a `srcset` downloads a
  candidate the browser will not use. Use `imagesrcset`/`imagesizes`.
- `rel="preload" as="script"` for an ES module is the wrong request mode; use
  `rel="modulepreload"`.
- Every hint competes for bandwidth. Preconnecting to ten origins, or
  preloading everything, delays what actually matters.

## Task

Export `planResourceHints(pageOrigin, resources)` returning an array of hint
objects, to be rendered as `<link>` tags. Each resource is
`{ url, type, critical, lcp?, module?, srcset?, sizes? }` where `type` is one
of `image`, `font`, `script`, `style`, `fetch`. Ignore resources that are not
`critical`.

**Connections** first. A resource is **CORS** when it is a `font`, a
`fetch`, or a `script` with `module: true`. For each critical resource whose
origin (`new URL(url).origin`) is **not** `pageOrigin`, take the pair
(origin, CORS or not); in first-seen order, deduplicated:

- the first **4** pairs become `{ rel: 'preconnect', href: origin }`, plus
  `crossorigin: 'anonymous'` for a CORS pair;
- later pairs become `{ rel: 'dns-prefetch', href: origin }` (no
  `crossorigin`), at most one per origin, and none for an origin that already
  has a preconnect.

**Preloads** after that, in resource order, at most one per `url`:

| resource | hint |
| --- | --- |
| `image` with `lcp: true` | `{ rel: 'preload', as: 'image', href, fetchpriority: 'high' }`, plus `imagesrcset` and `imagesizes` when the resource has `srcset` / `sizes` |
| other `image` | none — let the browser find it |
| `font` | `{ rel: 'preload', as: 'font', href, crossorigin: 'anonymous' }`, plus `type: 'font/woff2'` or `'font/woff'` when the pathname ends with `.woff2` / `.woff` |
| `script` with `module: true` | `{ rel: 'modulepreload', href }` |
| other `script` | `{ rel: 'preload', as: 'script', href }` |
| `style` | `{ rel: 'preload', as: 'style', href }` |
| `fetch` | `{ rel: 'preload', as: 'fetch', href, crossorigin: 'anonymous' }` |

`href` is the resource's `url` as given. Leave out keys that do not apply
(no `undefined` values).
