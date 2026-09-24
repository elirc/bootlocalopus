Template literal types let you build and destructure string types.
This is how libraries type `on('userCreated')` or extract `:id` from
`'/users/:id'`.

## Task

Export:

- `Getter<K>` — `'name'` becomes `'getName'` (use `Capitalize`)
- `Getters<T>` — an object type whose keys are `getX` and whose values return
  the original property type
- `EventName<T>` — `'click'` becomes `'onClick'`
- `RouteParams<P>` — `'/users/:userId/posts/:postId'` becomes
  `{ userId: string; postId: string }`; a route with no params becomes `{}`
- `Split<S, D>` — split a string type on a delimiter into a tuple