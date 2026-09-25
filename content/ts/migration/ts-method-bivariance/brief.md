`strict` is on, which includes `strictFunctionTypes`, so this is an error:

```ts
const onClick = (e: ClickEvent) => console.log(e.x);
const listener: (e: AppEvent) => void = onClick; // error: AppEvent has no x
```

and yet this, in the same codebase, compiles:

```ts
interface Listener { handle(event: AppEvent): void }
const listener: Listener = { handle: (e: ClickEvent) => console.log(e.x) }; // fine?!
listener.handle(keyEvent); // prints undefined
```

The difference is one of syntax. `strictFunctionTypes` deliberately **exempts
method syntax** (`handle(event): void`): method parameters stay *bivariant*,
for compatibility with how the DOM and older libraries were typed. Property
syntax (`handle: (event) => void`) gets the strict check. Codebases migrated
from JavaScript are full of method-syntax interfaces, so the flag is on but
protects nothing where it matters most: callbacks, validators and
repositories.

Arrays have the same hole. A `ClickEvent[]` is assignable to `AppEvent[]`, so a
function taking `AppEvent[]` can `push` a `KeyEvent` into your click list.

## Task

Change the **types** in the starter (and `withDefaults`' body) so the spec's
unsafe assignments are errors while the safe ones still compile:

- **`Listener`**, **`Validator<T>`** and **`Repository<T>`**: every member
  written in **property syntax**. Then a click-only handler is not a
  `Listener` (not even as a class instance), a `Validator<string>` is not a
  `Validator<string | number>` (it would `.trim()` a number), and a
  `Repository<ClickEvent>` is not a `Repository<AppEvent>` (you could `save` a
  key event into it). The reverse directions (a `Validator<unknown>` used as a
  `Validator<string>`, say) must still compile.
- **`dispatch(listeners, event)`**: `listeners` is `readonly Listener[]`.
- **`withDefaults(events)`**: takes `readonly AppEvent[]` and returns a **new**
  `AppEvent[]` with a `{ type: 'tick', at: 0 }` event appended, instead of
  pushing into the caller's array.

A `readonly` array parameter is the fix for the array hole: it promises the
caller "I will not add to this", and a `readonly ClickEvent[]` or a
`ClickEvent[]` can then be passed safely.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
