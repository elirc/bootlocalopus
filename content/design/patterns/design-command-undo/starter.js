export function createHistory({ limit = 100 } = {}) {
  const done = [];
  const undone = [];
  return {
    execute(command) {
      throw new Error('TODO');
    },
    undo() { return false; },
    redo() { return false; },
    canUndo: () => false,
    canRedo: () => false,
    undoLabel: () => null,
    redoLabel: () => null,
  };
}

export function addTodo(list, todo) {
  return {
    label: 'Add',
    execute() { list.push(todo); },
    undo() { /* TODO */ },
  };
}

export function removeTodo(list, id) {
  throw new Error('TODO');
}

export function renameTodo(list, id, text) {
  throw new Error('TODO');
}

export function toggleTodo(list, id) {
  throw new Error('TODO');
}
