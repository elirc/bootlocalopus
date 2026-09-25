Node runs two module systems side by side, and most codebases are
mid-migration between them.

- **CommonJS**: `require()` is a function call. It runs the file
  synchronously, returns whatever `module.exports` is at that moment, and
  caches it. `exports` are plain values copied out by destructuring.
- **ES modules**: `import` is declarative. The whole graph is linked
  before any code runs, imports are **live bindings** to the exporter's
  variables, top-level `await` is allowed, and `__dirname`, `require` and
  `module` do not exist. A `.js` file is ESM when the nearest `package.json`
  says `"type": "module"`; `.mjs` and `.cjs` force one or the other.

The interop between them is where the errors come from: "Named export not
found", `__dirname is not defined`, `ERR_REQUIRE_ASYNC_MODULE`, and a
singleton that somehow exists twice. Work each question out from the rules
above.
