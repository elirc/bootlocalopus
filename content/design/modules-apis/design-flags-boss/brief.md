Forty services import your team's feature-flag client. That makes it the
most dangerous module in the company: if `isEnabled` throws, forty checkout
pages throw; if it needs a network call per evaluation, forty services slow
down; if its API changes, forty teams have a bad week. Everything in this
chapter applies at once.

## Task

`bucket(flagKey, userId)` (a stable 0–99 number) and the deprecation
messages are given. Export `FlagLoadError`, `UnknownFlagError` (with `key`)
and `PluginError` (with `plugin`, `hook`, `cause`) — each extends `Error` with
`name` set to the class name — and

```js
createFlagClient({
  fetchFlags,        // required: async () => definitions
  defaults = {},     // flag key -> value to use when the client cannot decide
  plugins = [],      // [{ name, override?(key, user), onEvaluate?(event) }]
  onError = () => {},
  warn,              // (message, code); defaults to process.emitWarning
})
```

returning `{ ready, evaluate, isEnabled, isOn }`.

**Options.** An unknown option key, or a `fetchFlags` that is not a function,
throws a `TypeError` from `createFlagClient`. Copy `defaults`; later changes
to the caller's object have no effect.

**Definitions** look like
`{ 'beta-search': { enabled: true, rollout: 30, allow: ['vip'] } }`.

**`evaluate(key, user)`** returns `{ value, reason }` and **never throws**.
`user` is `{ id }`, `{}` or `undefined`. In order:

1. Each plugin's `override(key, user)`, in order: the first to return a
   **boolean** decides — `reason: 'override'`. Any other return value means
   "no opinion". A throwing override is skipped and reported.
2. Not loaded yet, or `key` is not an **own** key of the definitions → the
   default: `{ value, reason: 'default' }`, where `value` is `defaults[key]` if
   `defaults` has that **own** key, else `false`. An unknown
   key is reported as `UnknownFlagError`, **once per key**.
3. `enabled: false` → `{ value: false, reason: 'disabled' }` (even for
   allow-listed users: a kill switch is a kill switch).
4. `user.id` is in `allow` → `{ value: true, reason: 'allowlist' }`.
5. `rollout` (default 100) of 100 or more → `{ value: true, reason: 'on' }`.
   Otherwise `reason: 'rollout'`, and `value` is `bucket(key, user.id) <
   rollout` — `false` when there is no `user.id`.

Then call every plugin's `onEvaluate({ key, userId, value, reason })`
(`userId` is `user?.id`); a throwing one is reported and changes nothing.
`isEnabled(key, user)` is `evaluate(key, user).value`.

**Errors are reported, not thrown:** pass each to `onError(error)`. A
throwing `onError` is swallowed. Plugin failures are
`PluginError(plugin name, 'override' | 'onEvaluate', cause)`.

**`ready()`** loads the definitions and resolves `true`. If `fetchFlags`
throws or rejects, it reports a `FlagLoadError` with that `cause` and
resolves **`false`** — the app keeps running on defaults — and the next
`ready()` tries again. Concurrent calls share one fetch; once loaded,
`ready()` resolves `true` without fetching. Keep a **deep copy** of what
`fetchFlags` returned.

**Deprecations** (warn once per code via `warn(message, code)`; the new API
never warns):

- `isOn(key, user)` — old name for `isEnabled` → `FLAGS_DEP_001`.
- the `defaultValues` option — old name for `defaults` → `FLAGS_DEP_002`,
  warned at construction. Passing both throws a `TypeError`.

## The traps

- `bucket <= rollout` turns on bucket 0 at `rollout: 0` — the kill switch
  leaks to 1% of users.
- `definitions['toString']` exists on every plain object. Use
  `Object.hasOwn`.
- An `async` function that throws before its first `await` still rejects,
  but code **after** the call runs first. Clear the in-flight promise in a
  `.finally()` on it, not inside it, or a synchronous failure is never
  retried.
