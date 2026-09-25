A static `import` loads a module whether the code path needs it or not: the
PDF library for the one export button, every payment provider's SDK on
boot. `import()` loads on demand and returns a promise for the module's
**namespace object**. That is where the bugs are:

- The plugin you want is on `mod.default`, not `mod` — unless the author used
  named exports. A CommonJS module's `module.exports` also arrives as
  `default`.
- Loading plugins one `await` at a time makes boot as slow as all of them
  added up. `Promise.all` fixes the speed but reports whichever failure
  happened **first in time**, so the error you see changes from run to run.
- Caching the load promise is right (never fetch a chunk twice), but caching a
  **rejected** promise means one network blip breaks that screen until a full
  reload. This is the classic `React.lazy` "ChunkLoadError" bug.

## Task

Export `PluginLoadError`, `loadPlugins` and `lazy`.

### `class PluginLoadError extends Error`

`constructor(specifier, message, options)` passes `message` and `options`
(for `{ cause }`) to `Error`, sets `name` to `'PluginLoadError'` and
`specifier` to the specifier.

### `loadPlugins(specifiers, { importModule = (s) => import(s) } = {})`

Returns a promise for an array of plugins, **in the order of `specifiers`**.

- Start **every** `importModule(specifier)` call right away, in parallel.
- The plugin is `mod.default` when that is not `undefined`, otherwise the
  namespace `mod` itself (a module with named exports `name` and `setup`).
- A plugin is valid when `name` is a non-empty string and `setup` is a
  function. An invalid one fails with
  `` new PluginLoadError(specifier, `Plugin "${specifier}" must export a name and a setup function`) ``.
- A failed import fails with
  `` new PluginLoadError(specifier, `Could not load plugin "${specifier}"`, { cause: originalError }) ``.
- Two plugins with the same `name`: the later one (in `specifiers` order)
  fails with `` `Duplicate plugin name "${name}"` ``.
- Wait for every import to settle. If anything failed, reject with the error
  of the **first failing specifier in `specifiers` order**, whatever order
  the imports finished in.

### `lazy(loader)`

Returns a function `load()`:

- Nothing happens until the first `load()`; then `loader()` is called once
  and `load()` returns its promise. Later and concurrent calls return the
  **same** promise while it is pending or after it has fulfilled.
- If that promise rejects, the next `load()` calls `loader()` again.
- If `loader` throws synchronously, `load()` returns a rejected promise
  rather than throwing.
