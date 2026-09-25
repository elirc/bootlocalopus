JavaScript is the most expensive byte on the web: after downloading it, the
browser has to parse, compile and run it on the main thread, and a mid-range
phone does that several times slower than your laptop. Most bundle bloat
comes from a handful of patterns:

- **Everything in one entry.** The admin dashboard's chart library ships to
  every visitor of the home page. Route-level `import()` splits it off.
- **Tree shaking defeated.** Bundlers drop unused exports only from ES
  modules they can prove are side-effect free. CommonJS, barrel files that
  re-export everything, and packages without `"sideEffects": false` keep dead
  code alive.
- **Duplicates.** Two versions of the same library, because two dependencies
  pin different majors.
- **Polyfills and transpilation** for browsers you do not support.

Measure before you cut: a bundle analyzer (`rollup-plugin-visualizer`,
`source-map-explorer`) shows what is actually in each chunk.
