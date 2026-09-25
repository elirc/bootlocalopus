A Kanban board is where naive React state management falls over. Put the
board in `useState` at the top and pass it down, or in one context, and
dragging one card re-renders every column and every card; with a few hundred
cards the drag stutters. Add "undo" later and you discover half the updates
mutate arrays in place.

This boss puts the chapter together: a store outside React, subscribed per
slice; actions split from state; immutable updates with structural sharing;
and history.

## The board

```js
{
  columnOrder: ['todo', 'doing', 'done'],
  columns: {
    todo:  { id: 'todo',  title: 'To do', cardIds: ['a', 'b'] },
    doing: { id: 'doing', title: 'Doing', cardIds: [] },
    done:  { id: 'done',  title: 'Done',  cardIds: ['c'] },
  },
  cards: { a: { id: 'a', title: 'Write spec' }, … },
}
```

Never mutate it. An update copies only the objects on the path to the change:
moving a card inside `todo` produces a new `todo` column object, while `doing`
and `done` stay the **same objects**, and so does every card object whose own
fields did not change.

## Task

Export:

- `BoardProvider({ initialBoard, children })`, owning one board for its
  lifetime.

- `useBoard(selector, isEqual = Object.is)` returning `selector(board)`, and
  re-rendering **only** when the selected value changes by `isEqual`. The
  selector may be an inline function.

- `useBoardActions()` returning the **same object** on every render, with:
  - `addCard(columnId, title)`: trims the title and appends a card
    `{ id, title }` to the end of that column. Returns the new id: `'c1'`,
    `'c2'`, … counting per provider and skipping ids already in `cards`.
    Unknown column or a blank title: no change, returns `undefined`.
  - `moveCard(cardId, toColumnId, toIndex)`: removes the card from its column
    and inserts it at `toIndex` in the target, clamped to the valid range.
    For a move inside one column, `toIndex` is the position in the list
    **without** the card (so moving `a` in `[a, b, c]` to index 1 gives
    `[b, a, c]`). Moving a card to where it already is changes nothing.
  - `renameCard(cardId, title)`: trims; a blank or unchanged title changes
    nothing.
  - `deleteCard(cardId)`: removes it from its column and from `cards`.
  - `undo()` / `redo()`: step through history. Every action that changed the
    board is one entry; actions that changed nothing, unknown ids included,
    leave no entry. A change after an undo clears the redo history. Keep at
    most 50 entries.

- `useBoardHistory()` returning `{ canUndo, canRedo }`, re-rendering only
  when one of those flags changes.

- Outside a provider, each hook throws `Error('<hookName> must be used within
  a BoardProvider')`, e.g. `useBoardActions must be used within a
  BoardProvider`.

Render cost is part of the spec: the tests count renders of components that
select one column, one card, or only use the actions.
