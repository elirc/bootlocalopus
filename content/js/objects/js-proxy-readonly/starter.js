export function readonlyView(target) {
  // TODO: a cached Proxy per plain object / array whose writes throw
  throw new Error('readonlyView: not implemented');
}

export function isReadonlyView(value) {
  // TODO
  return false;
}
