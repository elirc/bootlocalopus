The CMS's "publish post" function started at twenty lines. Now it trims
titles, generates a slug, adds reading time, rejects posts without a cover
image *for one customer*, pings the search indexer, and posts to Slack. Every
feature is another block in the same function, and the Slack outage last
Tuesday stopped anyone from publishing.

A **plugin system** keeps the core small and lets features live beside it.
Vite, Rollup, ESLint, Babel and webpack's tapable all come down to a few
**hook kinds**, each with its own calling rule — and those rules are the
design:

| hook kind | rule | example |
| --- | --- | --- |
| **waterfall** | each plugin gets the previous plugin's output | `transform` |
| **bail** | stop at the first plugin that returns an answer | `validate` |
| **notify** | call everyone; one failing must not stop the others | `onComplete` |

## Task

A plugin is an object with a `name`, an optional `enforce: 'pre' | 'post'`,
and any subset of the hooks `transform(value, ctx)`, `validate(value, ctx)`
and `onComplete(value, ctx)`, each of which may be sync or async.

Export `PluginError`, `ValidationError` (both extend `Error`, `name` set to the
class name) and `createPipeline({ plugins = [], onPluginError = () => {} } = {})`
returning `{ names(), run(input) }`.

**At creation:** a plugin without a non-empty string `name` → `TypeError`; an
`enforce` other than `'pre'`, `'post'` or absent → `TypeError`; two plugins
with the same name → `Error`. Order the plugins: every `pre`, then the rest,
then every `post`, keeping registration order within each group. Do not
reorder the caller's array. `names()` returns the names in that order.

**`run(input)`** creates a fresh `ctx = { meta: {} }`, shared by every hook
call in that run, then:

1. **transform** (waterfall). Each plugin's result becomes the value, except
   `undefined`, which means "unchanged". (`''`, `0`, `null` are results.)
2. **validate** (bail). If a validator returns a **string**, reject with a
   `ValidationError` whose `message` is that string and whose `plugin` is the
   plugin's name; later validators are not called and `onComplete` never
   runs. Any other return value means "fine".
3. **onComplete** (notify). Call each in order with the final value. If one
   throws or rejects, call `onPluginError(error, { plugin, hook: 'onComplete' })`
   and carry on. Nothing in this step — not even a throwing `onPluginError` —
   can make `run` reject.
4. Resolve with the final value.

If a `transform` or `validate` hook **throws or rejects**, `run` rejects with
a `PluginError` with `plugin` (the name), `hook` (`'transform'` or
`'validate'`), `cause` (the original) and the message
`[<plugin>] <hook> failed: <cause message>`.

Hooks are called **as methods of their plugin**, so a class-based plugin can
use `this`.

## The traps

- `out || value` treats a transform that returns `''` as "unchanged". Compare
  with `undefined`.
- `const fn = plugin.transform; await fn(value, ctx)` loses `this`. Call
  `plugin.transform(value, ctx)`.
- `Array.prototype.sort` sorts in place (it would reorder the caller's array)
  and is stable, which is exactly what "keep registration order within a
  group" needs. Copy first.
- A throwing validator is a broken plugin, not a validation failure: it is a
  `PluginError`, not a `ValidationError`.
