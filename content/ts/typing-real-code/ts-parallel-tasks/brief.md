```ts
const [user, posts, unread] = await Promise.all([fetchUser(), fetchPosts(), countUnread()]);
```

Positional destructuring works until someone inserts a fourth call in the
middle and every name after it now holds the wrong value — with types that
may still line up. Page loaders reach for a keyed version instead:

```ts
const { user, posts, unread } = await parallel({ user: fetchUser, posts: fetchPosts, unread: countUnread });
```

Every codebase grows this helper, and it is usually typed
`Promise<Record<string, unknown>>` — so every caller casts, and the cast is
never updated when a loader changes.

Two things make the typed version work:

- A **homomorphic mapped type** (`{ [K in keyof T]: … }` over a type
  parameter) keeps the shape of what it maps: an object type stays an object
  type with the same keys, and a **tuple stays a tuple** with the same length.
  One `Results<T>` type serves both the keyed and the positional helper.
- Pull the resolved value out of each task with `infer` (or
  `Awaited<ReturnType<…>>`). Forgetting the unwrapping step gives you
  `Promise<User>` where you wanted `User`.

These helpers take **tasks** — functions that return a promise — not promises.
A promise has already started by the time you have it; a task lets the helper
decide when to start it (and, later, how many at once).

## Task

Export:

- **`Task<T = unknown>`** — `() => Promise<T>` (in the starter).
- **`ResultOf<F>`** — what task `F` resolves to.
- **`Results<T>`** — maps an object *or tuple* of tasks to their results:
  `Results<{ a: Task<string> }>` is `{ a: string }`;
  `Results<[Task<string>, Task<number>]>` is `[string, number]`.
- **`Settled<V>`** — in the starter.
- **`parallel(tasks)`** — runs an object of tasks concurrently; resolves to
  `Results` of it. A value that is not a task (a number, or an
  already-started promise) is a compile error.
- **`all(...tasks)`** — runs tasks passed as arguments; resolves to a tuple
  of their results, in order. `all()` resolves to `[]`.
- **`settle(tasks)`** — like `parallel` but never rejects: each key becomes a
  `Settled<its result>`.

The runtime code is already in the starter; the work is in the signatures. The
pairing of keys and values is lost in `Object.keys`/`Object.fromEntries`, so
one assertion on each helper's return value is expected.

`@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are not allowed in your
file.
