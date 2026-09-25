"LCP is 4.2 s" is a symptom, not a diagnosis. The fix for a slow server is
not the fix for a hero image that the browser discovers late, which is not
the fix for a stylesheet that blocks rendering after the image has arrived.
So LCP is broken into four **phases** that add up to it:

```
navigation ──► TTFB ──► image request starts ──► image downloaded ──► LCP painted
            │  ttfb  │      load delay        │   load duration    │ render delay │
```

- **TTFB**: the server (and redirects, DNS, TLS).
- **Load delay**: how long after the HTML started arriving the LCP image was
  **requested**. Large when the image is a CSS background, inserted by
  JavaScript, or lazy-loaded — the browser's preload scanner cannot see it.
- **Load duration**: the image download itself. Large when it is too big.
- **Render delay**: from "downloaded" to "painted". Large when
  render-blocking CSS or scripts are still loading, or the main thread is busy.

For a **text** LCP there is nothing to download: everything after TTFB is
render delay.

You get this data in the field from `PerformanceNavigationTiming`, the
`largest-contentful-paint` entry and the resource timing entries. Your job:
turn it into a diagnosis.

## Task

Export `diagnoseLcp({ navigation, lcp, resources })`:

- `navigation`: `{ responseStart }` — TTFB in ms;
- `lcp`: `{ startTime, url, loading }` — `url` is `''` for a text element;
  `loading` is the element's `loading` attribute (may be absent);
- `resources`: `[{ name, initiatorType, startTime, responseEnd, renderBlockingStatus }]`,
  where `renderBlockingStatus` is `'blocking'` or `'non-blocking'`.

**Kind and phases.** It is an **image** LCP when `lcp.url` is not `''` and a
resource's `name` equals it exactly; if several do, use the one with the
earliest `startTime`. Otherwise it is **text**. Compute with the raw numbers,
and round each phase with `Math.round` at the end:

| | image | text |
| --- | --- | --- |
| `ttfb` | `responseStart` | `responseStart` |
| `loadDelay` | `max(0, res.startTime − ttfb)` | `0` |
| `loadDuration` | `max(0, res.responseEnd − res.startTime)` | `0` |
| `renderDelay` | `max(0, lcp.startTime − res.responseEnd)` | `max(0, lcp.startTime − ttfb)` |

`value` is `Math.round(lcp.startTime)`; `rating` is `'good'` up to 2500,
`'needs-improvement'` up to 4000, else `'poor'` (inclusive bounds).

**Issues**, each included at most once, **in this order**, using the raw
(unrounded) numbers and strict `>`:

1. `'slow-server'` — `ttfb > 800`.
2. `'lazy-lcp'` — image, and `lcp.loading === 'lazy'`.
3. `'not-in-html'` — image, and its `initiatorType` is `'css'` or `'script'`.
4. `'late-discovery'` — image, and `loadDelay > 500`.
5. `'slow-download'` — image, and `loadDuration > 1000`.
6. When `renderDelay > 500`: the **blockers** are the resources with
   `renderBlockingStatus === 'blocking'` whose `responseEnd` is later than the
   moment the LCP could first have rendered (the image's `responseEnd`, or
   TTFB for text). If there are any, `'render-blocked'`; otherwise
   `'slow-render'` (main-thread work).

Return `{ kind, value, rating, phases: { ttfb, loadDelay, loadDuration, renderDelay }, issues, blockers }`,
where `blockers` is the list of blocker `name`s — sorted by `responseEnd`,
latest first, ties by `name` — when `'render-blocked'` is reported, and `[]`
otherwise.
