import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'ts-practice',
  title: 'Types in practice',
  summary: 'Types derived from runtime schemas, brands that stop swapped ids, and the tsconfig flags that strict mode leaves off.',
  lessons: [
    {
      id: 'ts-schema-infer',
      title: 'Types from your schema',
      kind: 'typecheck',
      xp: 100,
      why: 'A hand-written interface next to a validator drifts the first time someone edits one of them. Deriving the type is how Zod-style libraries make "validated" and "typed" the same thing.',
      tags: ['infer', 'mapped types', 'validation', 'generics'],
      hints: [
        'Make the builders generic so the element type survives: `arrayOf = <T>(schema: Schema<T>): Schema<T[]> => …` and `optional = <T>(schema: Schema<T>) => …`.',
        '`Infer` is one `infer`: `type Infer<S> = S extends Schema<infer T> ? T : never`.',
        'To let `object()` see optionality, give `optional()` its own return type: `interface OptionalSchema<T> extends Schema<T | undefined> { readonly optional: true }`, and add `optional: true` to the returned object. A plain `Schema<string>` has no `optional` property, so `S[K] extends OptionalSchema<unknown>` tells them apart.',
        'Split the keys: `OptionalKeys<S> = { [K in keyof S]: S[K] extends OptionalSchema<unknown> ? K : never }[keyof S]`, and the required keys are `Exclude<keyof S, OptionalKeys<S>>`. Then build `{ [K in Required]: Infer<S[K]> } & { [K in Optional]?: Exclude<Infer<S[K]>, undefined> }`.',
        'That intersection is not *identical* to the flat object, so `Equal` fails. Wrap it: `type Simplify<T> = { [K in keyof T]: T[K] } & {}`. Finally `object = <S extends Record<string, Schema<unknown>>>(shape: S): Schema<Simplify<…>>` — and the body\'s `return out` needs `as` that type, since the checker cannot follow the loop.',
      ],
    },
    {
      id: 'ts-branded',
      title: 'Branded types for ids and units',
      kind: 'typecheck',
      xp: 85,
      why: 'Swapped id arguments and dollars-versus-cents are bugs the compiler can catch for free — once a `UserId` is not just any `string`.',
      tags: ['branded types', 'type predicates', 'assertion functions', 'boundaries'],
      hints: [
        'Declare a brand once: `declare const brand: unique symbol; export type Brand<T, B extends string> = T & { readonly [brand]: B };` then `export type UserId = Brand<string, "UserId">`, and likewise for `OrderId` and `Cents`.',
        'A branded value can only be produced by a cast, so each constructor ends in one — after the check: `return raw as OrderId`, `return amount as Cents`.',
        '`isUserId` needs an explicit predicate, `(value: unknown): value is UserId` — TypeScript will not infer one from a regex test. `assertUserId` is `(value: unknown): asserts value is UserId`; once it has returned, `raw` is a `UserId`, so `userId` can simply `return raw`.',
        'The money helpers lose the brand the moment they do `a + b`; route the result back through `cents(...)` to re-brand (and re-check) it. Give `sumCents` a `readonly Cents[]` parameter and start the reduce from `cents(0)`.',
      ],
    },
    {
      id: 'ts-tsconfig',
      title: 'A tsconfig that catches bugs',
      kind: 'quiz',
      xp: 75,
      why: '`strict: true` leaves off several flags that catch real production bugs, and the rest of the file decides whether your code even starts under Node, a bundler or a `.d.ts` emitter.',
      tags: ['tsconfig', 'compiler flags', 'modules', 'tooling'],
      quiz: [
        {
          q: 'With `"strict": true` already on, which flag makes the second line an error?\n\n```ts\nconst first = items[0];            // items: string[]\nreturn first.toUpperCase();\n```',
          options: [
            '`noUncheckedIndexedAccess`',
            '`strictNullChecks`',
            '`noImplicitAny`',
            '`noPropertyAccessFromIndexSignature`',
          ],
          answer: [0],
          explain: '`strict` already includes `strictNullChecks`, yet `items[0]` is typed `string` — TypeScript assumes every index read hits. `noUncheckedIndexedAccess` makes array and record index reads `T | undefined`, so the empty-array case becomes a compile error (`\'first\' is possibly \'undefined\'`) instead of a `Cannot read properties of undefined` in production. The cost is a guard or a `!` in index-based loops; `for…of` and destructuring with defaults avoid most of it. `noPropertyAccessFromIndexSignature` is about `obj.key` versus `obj["key"]` syntax, not about undefined.',
        },
        {
          q: 'Which flag rejects the second line?\n\n```ts\ninterface Opts { timeoutMs?: number }\nconst o: Opts = { timeoutMs: undefined };\n```',
          options: [
            '`strictNullChecks`',
            '`exactOptionalPropertyTypes`',
            '`strictPropertyInitialization`',
            '`noUncheckedIndexedAccess`',
          ],
          answer: [1],
          explain: 'By default `timeoutMs?: number` means `number | undefined`, so "absent" and "present but undefined" are the same type. They are not the same at runtime: `{ ...defaults, ...opts }` with `timeoutMs: undefined` overwrites the default with `undefined`, and `"timeoutMs" in o` is true. `exactOptionalPropertyTypes` separates the two — a key may be missing, but if it is there it must be a `number`. If you really mean "may be explicitly undefined", you write `timeoutMs?: number | undefined`.',
        },
        {
          q: '`User` is an interface exported from `./types.ts`. Which flag makes the import line an error?\n\n```ts\nimport { User } from \'./types.js\';\nexport function greet(u: User) { return u.name; }\n```',
          options: [
            '`isolatedModules`',
            '`verbatimModuleSyntax`',
            '`esModuleInterop`',
            '`noUnusedLocals`',
          ],
          answer: [1],
          explain: 'Under `verbatimModuleSyntax` the emitted JavaScript keeps every import exactly as written, dropping only those marked `type` — so importing a type without `type` is an error (TS1484): at runtime `./types.js` exports no `User`, and a tool that strips types file-by-file (esbuild, swc, Node\'s own type stripping) would leave `import { User }` in place and crash at startup with "does not provide an export named User". The fix is `import type { User }`. `isolatedModules` is the plausible distractor: it catches the related `export { User } from` re-export case, but a plain type import compiles under it.',
        },
        {
          q: 'A Node service with `"type": "module"`, compiled by `tsc` and run with `node dist/server.js`. Which setting turns this import into an error — and is that the behaviour you want?\n\n```ts\nimport { slugify } from \'./utils\';\n```',
          options: [
            '`"module": "nodenext"` — yes: Node\'s ESM loader does not guess extensions, so the emitted `./utils` would fail with ERR_MODULE_NOT_FOUND; write `./utils.js`',
            '`"moduleResolution": "bundler"` — yes: bundler mode is the strictest resolution mode',
            '`"module": "nodenext"` — no: it is a false positive, because `tsc` rewrites `./utils` to `./utils.js` when it emits',
            '`"allowImportingTsExtensions"` — yes: it forces every import to name the `.ts` file',
          ],
          answer: [0],
          explain: '`nodenext` (which also sets `moduleResolution`) models what Node will actually do with the emitted file: in ESM, relative specifiers need the real extension, so TypeScript reports TS2835 ("Did you mean \'./utils.js\'?"). `tsc` never rewrites specifiers (only the opt-in `rewriteRelativeImportExtensions` does, and only for `.ts` specifiers). `bundler` is the lenient mode: it allows extensionless imports because Vite or esbuild will resolve them — correct for front-end code a bundler processes, and a lie for code Node runs directly. Pick the resolution mode that matches the thing that runs your code.',
        },
        {
          q: 'Which flag reports both marked constructs as errors?\n\n```ts\nexport enum Status { Active, Disabled }              // (1)\nexport class Repo { constructor(private db: Db) {} }  // (2)\n```',
          options: [
            '`verbatimModuleSyntax`',
            '`isolatedModules`',
            '`erasableSyntaxOnly`',
            '`preserveConstEnums`',
          ],
          answer: [2],
          explain: 'Node 22.18+ and 24 can run `.ts` files directly by *erasing* types — replacing them with whitespace — and that only works for syntax that is pure annotation. An `enum` generates an object, and a parameter property (`private db`) generates an assignment in the constructor; Node refuses both at startup. `erasableSyntaxOnly` (TS 5.8) makes them compile errors (TS1294) so you find out in the editor. Use a `const` object plus a derived union instead of an enum, and assign fields explicitly. `verbatimModuleSyntax` is the other flag you want for type stripping, but it is about imports, not enums.',
        },
        {
          q: 'A library package enables a flag so that tools like oxc or swc can generate its `.d.ts` files one file at a time, without running the type checker. Which flag rejects this line?\n\n```ts\nexport function parsePort(raw: string) { return Number(raw); }\n```',
          options: [
            '`noImplicitAny`',
            '`noImplicitReturns`',
            '`declaration`',
            '`isolatedDeclarations`',
          ],
          answer: [3],
          explain: 'Writing the declaration `parsePort(raw: string): number` requires *inferring* the return type, which needs the full checker. `isolatedDeclarations` (TS 5.5) requires every exported function, and every exported value that is not trivially inferable, to carry an explicit annotation (TS9007), so declaration emit becomes a per-file, near-instant transform — a real win in large monorepos. `noImplicitAny` only covers parameters and bindings that have no type at all; `declaration` emits `.d.ts` files but happily infers; `noImplicitReturns` is about code paths that fall off the end.',
        },
        {
          q: 'A new Node 24 service runs its source directly with `node src/server.ts` (type stripping, no build step) and type-checks with `tsc --noEmit`. Which settings belong in its tsconfig? Select all.',
          options: [
            '`"erasableSyntaxOnly": true`',
            '`"verbatimModuleSyntax": true`',
            '`"module": "nodenext"` with `"allowImportingTsExtensions": true`, importing `./utils.ts`',
            '`"moduleResolution": "bundler"`, so imports can omit the extension',
          ],
          answer: [0, 1, 2],
          explain: 'Type stripping runs exactly the file you wrote, minus the annotations. So: nothing that needs code generation (`erasableSyntaxOnly`), every type-only import marked `type` so it is erased rather than executed (`verbatimModuleSyntax`), and specifiers that Node can resolve as written — which, with no emit step, means the real `.ts` file name, allowed by `allowImportingTsExtensions` under `nodenext`. `bundler` resolution would accept `./utils` without an extension, which type-checks and then fails at startup: there is no bundler in this picture.',
        },
      ],
    },
  ],
});
