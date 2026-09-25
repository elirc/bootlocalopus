export function withReset(reducer, resetType) {
  return (state, action) =>
    action.type === resetType ? reducer(undefined, action) : reducer(state, action);
}

export function filterActions(reducer, predicate) {
  return (state, action) => {
    // Always let the reducer produce its initial state.
    if (state !== undefined && !predicate(action)) return state;
    return reducer(state, action);
  };
}

const IDLE = Object.freeze({ status: 'idle', error: null, requestId: null });

export function requestStatus(prefix) {
  const pending = `${prefix}/pending`;
  const fulfilled = `${prefix}/fulfilled`;
  const rejected = `${prefix}/rejected`;

  return (state = IDLE, action) => {
    const requestId = action.meta?.requestId;
    switch (action.type) {
      case pending:
        return { status: 'loading', error: null, requestId };
      case fulfilled:
        // A response for anything but the latest request is stale.
        if (state.requestId === null || requestId !== state.requestId) return state;
        return { status: 'succeeded', error: null, requestId: null };
      case rejected:
        if (state.requestId === null || requestId !== state.requestId) return state;
        return { status: 'failed', error: action.error?.message ?? 'Unknown error', requestId: null };
      default:
        return state;
    }
  };
}

export function keyedBy(reducer, getKey) {
  return (state = {}, action) => {
    const key = getKey(action);
    if (key === undefined || key === null) return state;
    const previous = Object.hasOwn(state, key) ? state[key] : undefined;
    const next = reducer(previous, action);
    if (next === previous) return state;
    return { ...state, [key]: next };
  };
}
