Form libraries, i18n keys, `lodash.get`, analytics property names — all take a
**dotted path** as a string: `get(settings, 'profile.address.city')`. Typed as
`string`, a typo (`'profile.adress.city'`) compiles and returns `undefined` at
runtime, and the result is `unknown`, so every caller casts. A recursive
template-literal type makes both the path and the result checked.

The second trap is subtler: `settings.notifications?.email` is
`boolean | undefined` when `notifications` is optional. A `PathValue` that
forgets about the optional *parent* says `boolean`, and the `undefined` gets
through anyway.

## Task

The runtime `get` in the starter already works. Fix the two types it uses:

**`Paths<T>`** — the union of every dotted path into `T`:

- every string key of an object is a path, and so is `key.` + each path of its
  value (`'profile'`, `'profile.address'`, `'profile.address.city'`, …);
- optional or nullable values are descended into as if present
  (`notifications?: { email: boolean }` gives `'notifications'` and
  `'notifications.email'`);
- **arrays, `Date`s and functions are leaves**: an array or `Date` key is a
  path but nothing below it is; a key whose value is a function (a method, or
  an optional callback) is **not a path at all**;
- a primitive has no paths: `Paths<string>` is `never`.

**`PathValue<T, P>`** — the type found at `P`, with `P` a string. It must
behave like optional chaining: if any parent on the way is optional or
nullable, the result includes `undefined` (never `null`):

| path | `PathValue<Settings, path>` |
| --- | --- |
| `'profile.address.city'` | `string` |
| `'notifications.email'` (optional parent) | `boolean \| undefined` |
| `'manager.name'` (`manager: {…} \| null`) | `string \| undefined` |
| `'profile.nickname'` (optional leaf) | `string \| undefined` |

The spec checks `Paths` with exact equality, and that `get` rejects typos,
`'tags.0'`, `'save'`, `'profile.'` and `'theme.length'`.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
