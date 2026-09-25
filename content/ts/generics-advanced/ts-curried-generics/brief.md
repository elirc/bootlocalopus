```ts
function select<Row, K extends keyof Row>(table: string, ...columns: K[]): Promise<Pick<Row, K>[]>

select<User>('users', 'id', 'email');
// error TS2558: Expected 2 type arguments, but got 1.
```

The row type cannot be inferred — it comes from your database, not from any
argument — so the caller must write it. The selected columns *can* be
inferred, and writing them twice (`select<User, 'id' | 'email'>('users', 'id', 'email')`)
is exactly the busywork generics were meant to remove. But TypeScript's type
arguments are **all or nothing**: once you supply one explicitly, the others
are not inferred. They take their defaults, or it is an error.

The standard way out, used by query builders, form libraries and typed event
systems alike, is to **curry the type parameters**: a first call that takes
the explicit ones and returns a generic function that infers the rest.

```ts
selectFrom<User>('users')(exec, 'id', 'email'); // Row explicit, K inferred
```

## Task

**`selectFrom<Row>(table)`** returns an async function
`(exec, ...columns) => Promise<Pick<Row, K>[]>` where `K` is inferred from
the column names.

- `exec` has the exported type `Exec = (sql: string) => Promise<unknown[]>`
  (it is in the starter).
- The function runs `` exec(`select ${columns.join(', ')} from ${table}`) ``
  and returns its rows. The rows come from outside the type system, so one
  assertion on them is the contained, honest trade-off — the same one every
  database client makes.
- Spec: `selectFrom<User>('users')(exec, 'id', 'email')` is
  `Promise<Pick<User, 'id' | 'email'>[]>`; `'password_hash'` (not a `User`
  key) is an error.

**`handlersFor<Events>()`** returns a function that takes an object of
handlers for **some** of the events and returns `{ handles, dispatch }`:

- `Events` maps an event name to its payload type, e.g.
  `{ signup: { email: string }; login: { id: number }; logout: undefined }`.
- Each handler's parameter is inferred from `Events` — callers write
  `signup: (p) => p.email`, no annotation.
- A handler for an event that is not in `Events` is an error, and so is a
  handler whose parameter has the wrong type.
- `handles` is an array of the handled event names, typed as exactly those
  names (`('signup' | 'login')[]`).
- `dispatch(event, payload)` calls that handler. It only accepts **handled**
  events, and the payload must match that event.

Hint for the second part: an object type `{ [P in K]: … }` where `K` is a
type parameter lets TypeScript infer `K` from the keys of the object you pass.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
