export function diff(prev, next) {
  // TODO: add / remove / replace operations with array paths,
  // skipping anything that is the same object in both
  throw new Error('diff: not implemented');
}

export function applyPatch(state, ops) {
  // TODO: apply immutably, copying only the paths the operations touch
  throw new Error('applyPatch: not implemented');
}
