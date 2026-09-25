Once a client has parsed a response into a union keyed by `status`, the call
sites still get it wrong:

```ts
if (res.status === 201) toast('Created');
else toast(res.body.message); // 422 has no message: its body is { errors }
```

The `else` lumps three different failures together, and when the API adds a
`409 Conflict` nothing tells you which screens forgot to handle it. A
**matcher** that takes one handler per status fixes both problems: each
handler sees exactly its own response type, and a missing status does not
compile.

The spec is type-level: it calls your functions on a
`CreateOrderResponse` union (201, 400, 409, 422) and checks what the compiler
infers.

## Task

Export (`AnyResponse` is `{ status: number }`):

**`ResponseFor<R, S>`**: the member(s) of `R` whose `status` is `S`. `S` must
be one of `R`'s statuses (`ResponseFor<CreateOrderResponse, 404>` is an error).

**`Handlers<R, Out>`**: an object with **exactly one key per status** of `R`,
each a function taking that status's response and returning `Out`.

**`match(res, handlers)`**: calls the handler for `res.status`. Every status
must have a handler (a missing one is a compile error), each handler's
parameter is inferred without annotations, and the return type is the
**union of what the handlers return** (`Order | null` if one returns the
body and the others `null`).

**`matchOr(res, handlers, fallback)`**: `handlers` covers **some** statuses
(or none); `fallback` gets the rest, and its parameter type is **only the
statuses the handlers did not cover**: handle 201 and the fallback sees
`400 | 409 | 422`. A handler key that is not a status of `R` is an error.
Returns what the handlers and fallback return.

**`isStatus(res, ...statuses)`**: a type guard narrowing `res` to the members
with those statuses (and, in the `else` branch, to the rest). Only statuses of
`R` are accepted.

The trap is inference. The obvious signature,
`match<R, Out>(res: R, handlers: Handlers<R, Out>): Out`, compiles, but the
compiler cannot type the handler parameters through a mapped type that is
still being inferred, so every `(r) => …` becomes an implicit `any`, a strict-mode
error. Give the handlers object **its own type parameter**,
`H extends Handlers<R, unknown>`: the constraint gives each handler its
parameter type, and the result can be read back off `H`. The same trick gives
`matchOr` its fallback type: `keyof H` is exactly the statuses you handled.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your file.
