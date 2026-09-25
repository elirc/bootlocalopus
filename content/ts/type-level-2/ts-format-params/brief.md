A translation string says `'You have {count:number} unread messages'`. The
call site passes `{ cnt: 4 }`. Nothing complains; the user sees
"You have undefined unread messages". Message catalogues are the classic place
where the information the compiler needs is **inside a string** — and template
literal types can parse it out. (i18next and typesafe-i18n do exactly this.)

## Task

Placeholders look like `{name}` or `{name:type}`, where the type is one of
`string`, `number` or `date`. Names are word characters; there is no
whitespace inside the braces and no escaping.

**`FormatParams<S>`** — the params object a template needs: one key per
placeholder name, with type `string` for `{name}` and `{name:string}`,
`number` for `{name:number}`, `Date` for `{name:date}`, and **`never`** for any
other type annotation (so `{amount:money}` can never be satisfied — a typo in
the template is caught at the call site). A name used twice is one key. A
template with no placeholders gives `{}`.

**`FormatArgs<S>`** — the rest-parameter tuple after the template: `[]` when
there are no placeholders, otherwise `[params: FormatParams<S>]`. That makes
`format('Just text')` legal, `format('Just text', {})` an error, and
`format('Hello {name}!')` (params forgotten) an error.

`format` and `createTranslator` are given and already use these two types.
With them right, this compiles only when every key and type is right:

```ts
const t = createTranslator({ inbox: 'You have {count:number} unread messages', logout: 'Signed out' } as const);
t('inbox', { count: 4 });
t('logout');
```

The spec checks both types with exact equality and a set of calls that must
and must not compile.

Two traps. A template-literal match takes the **first** `{…}` it finds and
stops; unless you recurse on the rest of the string, a second placeholder is
silently ignored and `{ name: 'Ada' }` satisfies `'Hello {name} from {city}'`.
And an optional params tuple (`[params?: …]`) is not the same as "none" or
"required": it lets `format('Hello {name}!')` compile. "Does `S` have
placeholders?" is the question "is this union `never`?" — ask it as
`[X] extends [never]`, because `X extends never` returns `never` (neither
branch) whenever `X` is a bare type parameter.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
