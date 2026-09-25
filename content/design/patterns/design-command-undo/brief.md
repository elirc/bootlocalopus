"Can we have undo?" is a feature request that is a one-day job if every change
already goes through a **command** object, and a rewrite if it does not. The
bugs are always the same: redo that survives a new edit (and redoes onto the
wrong document), a delete whose undo puts the item back at the end, and fifty
undo steps for typing one word.

## Task

**The history.** Export `createHistory({ limit = 100 } = {})` returning:

- `execute(command)` — calls `command.execute()`, then records it. A new
  command **clears the redo stack**. If `command.execute()` throws, the error
  propagates and the history is exactly as it was (not recorded, redo stack
  intact). When more than `limit` commands are recorded, the oldest is dropped.
- `undo()` / `redo()` — call the command's `undo()` / `execute()`, move it to
  the other stack, and return `true`; return `false` when there is nothing to do.
- `canUndo()`, `canRedo()` — booleans.
- `undoLabel()`, `redoLabel()` — the `label` of the command that would be
  undone/redone next, or `null`.

**Merging.** A command may have `merge(next)`. When you execute `next` and the
command on top of the undo stack has a `merge` that returns a command (not
`null`/`undefined`), that returned command **replaces** the top entry instead of
`next` being pushed. But never merge into a command you reached by `undo()` or
`redo()`: after either of those, the next `execute` always starts a new entry.

**The commands.** A todo list is an array of `{ id, text, done }` that the
commands mutate in place. Export factories returning commands (each with a
`label`):

| factory | label | execute | undo |
| --- | --- | --- | --- |
| `addTodo(list, todo)` | `'Add'` | append `todo` | remove it |
| `removeTodo(list, id)` | `'Delete'` | remove the todo; throws if `id` is not in the list | put it back **at the index it had** |
| `renameTodo(list, id, text)` | `'Rename'` | set its `text` | restore the previous `text` |
| `toggleTodo(list, id)` | `'Toggle'` | flip `done` | flip it back |

`renameTodo` merges with a following `renameTodo` of the **same** id, so
typing "B", "Bu", "Buy" in a rename box is one undo step that restores the
text from before the first keystroke. Renames of different ids do not merge.

## The traps

- `removeTodo` must find the index when it **executes**, not when it is
  created: by the time a redo runs, the list may look different.
- A merge must keep the *first* command's "before" text and the *last*
  command's "after" text.
