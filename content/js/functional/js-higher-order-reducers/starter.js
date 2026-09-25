export function withReset(reducer, resetType) {
  // TODO: reset to the wrapped reducer's initial state on resetType
  return () => {
    throw new Error('withReset: not implemented');
  };
}

export function filterActions(reducer, predicate) {
  // TODO: ignore actions the predicate rejects (but still initialise)
  return () => {
    throw new Error('filterActions: not implemented');
  };
}

export function requestStatus(prefix) {
  // TODO: idle -> loading -> succeeded | failed, ignoring stale responses
  return () => {
    throw new Error('requestStatus: not implemented');
  };
}

export function keyedBy(reducer, getKey) {
  // TODO: one slice of `reducer` per key
  return () => {
    throw new Error('keyedBy: not implemented');
  };
}
