export function createHistory({ limit = 100 } = {}) {
  const done = [];
  const undone = [];
  // True only while the top of `done` was pushed by execute(), i.e. it is
  // the thing the user just did and may be extended by a merge.
  let topIsFresh = false;

  return {
    execute(command) {
      command.execute(); // if this throws, nothing below runs: history unchanged
      const top = done[done.length - 1];
      const merged = topIsFresh && top?.merge ? top.merge(command) : null;
      if (merged) {
        done[done.length - 1] = merged;
      } else {
        done.push(command);
        if (done.length > limit) done.shift();
      }
      undone.length = 0;
      topIsFresh = true;
    },
    undo() {
      const command = done.pop();
      if (!command) return false;
      command.undo();
      undone.push(command);
      topIsFresh = false;
      return true;
    },
    redo() {
      const command = undone.pop();
      if (!command) return false;
      command.execute();
      done.push(command);
      topIsFresh = false;
      return true;
    },
    canUndo: () => done.length > 0,
    canRedo: () => undone.length > 0,
    undoLabel: () => done[done.length - 1]?.label ?? null,
    redoLabel: () => undone[undone.length - 1]?.label ?? null,
  };
}

function find(list, id) {
  const todo = list.find((t) => t.id === id);
  if (!todo) throw new Error(`No todo with id ${id}`);
  return todo;
}

export function addTodo(list, todo) {
  return {
    label: 'Add',
    execute() { list.push(todo); },
    undo() { list.splice(list.indexOf(todo), 1); },
  };
}

export function removeTodo(list, id) {
  let removed = null;
  let index = -1;
  return {
    label: 'Delete',
    execute() {
      index = list.findIndex((t) => t.id === id);
      if (index === -1) throw new Error(`No todo with id ${id}`);
      [removed] = list.splice(index, 1);
    },
    undo() { list.splice(index, 0, removed); },
  };
}

// `from` is captured on first execute so a merged command can carry the
// original text forward.
function rename(list, id, text, from) {
  return {
    label: 'Rename',
    id,
    text,
    execute() {
      const todo = find(list, id);
      if (from === undefined) from = todo.text;
      todo.text = text;
    },
    undo() { find(list, id).text = from; },
    merge(next) {
      if (next.label !== 'Rename' || next.id !== id) return null;
      return rename(list, id, next.text, from);
    },
  };
}

export function renameTodo(list, id, text) {
  return rename(list, id, text, undefined);
}

export function toggleTodo(list, id) {
  const flip = () => { const t = find(list, id); t.done = !t.done; };
  return { label: 'Toggle', execute: flip, undo: flip };
}
