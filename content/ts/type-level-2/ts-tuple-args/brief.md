Every service layer grows helpers that **reshape a function's parameter list**:
pre-fill the sender of an email function, or bind a request context into a
bag of handlers so route code can call `api.getOrder(id)` instead of
`getOrder(ctx, id)`. Typed as `(...args: any[]) => any`, the helper erases
every signature it touches — the wrong number of arguments compiles, and the
return type is `any` from then on.

A parameter list is a **tuple type**, and TypeScript can split, infer and
spread tuples. That is the whole trick.

## Task

**`DropFirst<T>`** — the tuple `T` without its first element. Works on
`readonly` tuples too (the result is a plain mutable tuple), keeps a rest
element (`[number, ...string[]]` → `string[]`), and gives `[]` for `[]`.

**`partial(fn, ...head)`** — returns a function taking **exactly** the
parameters of `fn` that `head` did not fill, with `fn`'s return type:

```ts
declare function sendEmail(from: string, to: string, subject: string, urgent: boolean): Promise<void>;
const fromSupport = partial(sendEmail, 'support@example.com');
//    ^? (to: string, subject: string, urgent: boolean) => Promise<void>
```

The spec checks `Parameters<typeof fromSupport>` with exact equality (tuple
labels do not affect equality), and that a wrong type in `head`, too many
`head` arguments, and a missing tail argument are all errors.

**`Bound<H>`** and **`bindAll(ctx, handlers)`** — `handlers` is an object of
functions whose first parameter is a context; `Bound<H>` maps each to the same
function **without** its first parameter (optional later parameters stay
optional, return types are unchanged). `bindAll`'s runtime body is given; make
`Bound` right. Passing a context that does not satisfy the handlers'
parameter type must not compile.

The trap in `partial`: one type parameter for the whole parameter list
(`fn: (...args: A) => R, ...head: Partial<A>`) cannot tell where `head` ends.
Give the compiler **two** tuples and let it infer the split:
`(...args: [...Head, ...Tail]) => R`.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
