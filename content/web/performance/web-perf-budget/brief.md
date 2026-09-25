A performance budget only works if CI enforces it, and it only means
something if it measures what the user actually downloads **before the page
works**: the entry chunk plus everything it imports statically — not the
lazy routes, and not a shared chunk counted twice.

Vite (and Rollup) write that graph to `.vite/manifest.json`:

```json
{
  "src/main.ts":      { "file": "assets/main-4f3a.js", "isEntry": true,
                        "imports": ["_vendor-9c1e.js"], "dynamicImports": ["src/pages/Admin.tsx"],
                        "css": ["assets/main-77aa.css"] },
  "_vendor-9c1e.js":  { "file": "assets/vendor-9c1e.js" },
  "src/pages/Admin.tsx": { "file": "assets/Admin-1b2c.js", "isDynamicEntry": true,
                        "imports": ["_vendor-9c1e.js"] }
}
```

`imports` and `dynamicImports` hold manifest **keys**; `file` and `css` hold
output files. Real graphs have diamonds (two chunks importing the same
vendor chunk) and, occasionally, **cycles**.

## Task

Export `checkBudget(manifest, sizes, budgets)`.

- `sizes` maps an output file to its gzipped size in bytes. A file that is
  needed but missing from `sizes` → throw an `Error` whose message contains
  the file name.
- `budgets` is `{ initialJs?, initialCss?, chunk? }` in bytes. A budget that is
  absent is not checked.

For each **entry** (a chunk with `isEntry: true`), in the order of the
manifest's keys, walk its **static** `imports` transitively (never
`dynamicImports`), visiting each chunk once even through diamonds and cycles.
The chunks reached, the entry included, are its **initial** chunks:

- `js`: the sum of their `file` sizes, each file counted once;
- `css`: the sum of the sizes of their `css` files, each file counted once;
- `files`: their `file`s, sorted alphabetically.

Return `{ entries, violations, ok }`:

- `entries`: `[{ name, js, css, files }]` where `name` is the manifest key;
- `violations`, in this order:
  1. per entry, in entry order: `{ kind: 'initial-js', entry, size, budget }`
     when `js > initialJs`, then `{ kind: 'initial-css', … }` when
     `css > initialCss`;
  2. then `{ kind: 'chunk', file, size, budget }` for **every** chunk in the
     manifest (entries, shared and dynamic ones) whose `file` is larger than
     `chunk`, sorted by `file`. A file listed by two keys is reported once.
- `ok`: `violations.length === 0`.

Exactly at the budget is fine; only strictly greater is a violation.
