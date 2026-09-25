```
error TS7016: Could not find a declaration file for module 'slugify-legacy'.
```

The quick fix everyone reaches for is one line in a `.d.ts` file:

```ts
declare module 'slugify-legacy';
```

It compiles, and it types every import from that package as **`any`** — which
then leaks into every value it touches. The real fix is a declaration that
describes the library's actual shape. You write these for old internal
packages, for vendor SDKs without types, for asset imports, and for constants
your bundler injects.

Traps:

- A declarations file must **not** have a top-level `import` or `export`.
  Without one, the file is a global script and `declare module 'x' { … }`
  declares a module. With one, the same block means "augment the existing
  module `x`" — and fails because there is no `x` to augment.
- **CommonJS `module.exports = fn`** is not a default export. Describe it with
  `export =`. When the function also has properties (`fn.defaults`), merge a
  `namespace` with the same name into the function to carry them — and any
  types callers need (`slugify.Options`).
- Asset imports are declared with **wildcard** module names (`'*.svg'`).

## The libraries

This file is your `types/vendor.d.ts`. Declare exactly this surface.

**`slugify-legacy`** (CommonJS):

```js
function slugify(text, options) { … }       // text: string; returns string
// options (optional): { separator?: string, lower?: boolean, strict?: boolean }
slugify.defaults = { separator: '-', lower: true, strict: false };
slugify.extend = function (charMap) { … };  // e.g. { '♥': 'love' }; returns nothing
module.exports = slugify;
```

Callers `import slugify from 'slugify-legacy'` and can name the options type
as `slugify.Options`. `slugify.defaults` has every option present.

**`feature-flags-client`** (ESM):

```js
export const VERSION = '2.3.1';
export function createClient({ sdkKey, pollIntervalMs }) { … } // sdkKey required
// client.isEnabled(flag, context?)  → boolean
//   context: { userId?: string, country?: string, …any other attribute: string | number | boolean }
// client.variant(flag, fallback)    → string   (both strings)
// client.on(event, listener)        → an unsubscribe function
//   'ready'  → listener()                     no arguments
//   'error'  → listener(error: Error)
//   'update' → listener(changedFlags: string[])
//   any other event name is an error
// client.close()                    → Promise<void>
```

Export the client's type as **`FlagClient`** (callers write
`const client: FlagClient = createClient(…)`).

**Assets:** `import logo from './logo.svg'` gives a URL `string`;
`import styles from './Button.module.css'` gives an object of read-only
class-name strings.

**Build-time constants:** `__APP_VERSION__` (a `string`) and `__DEV__` (a
`boolean`) are substituted by the bundler and used as globals.

Nothing may come out as `any`. `@ts-ignore`, `@ts-expect-error` and
`@ts-nocheck` are not allowed in your file.
