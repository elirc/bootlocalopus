React matches old and new children by `key`. With `key={index}`, deleting
the first row tells React "row 0 kept its identity, its content just changed" —
so it keeps the DOM node, along with any state living inside it: input values,
focus, scroll position.

## Task

`TodoEditor` uses index keys and loses typed text when a row above is removed.
Fix it. The data already has stable `id`s.

Keep the structure: a labelled input per todo (label = the todo's title) and a
`Delete <title>` button.

The same mechanism is useful on purpose: changing a component's `key`
throws away its state. `<EditForm key={user.id} user={user} />` is the idiomatic
way to reset a form when the selected user changes — no effect needed.
