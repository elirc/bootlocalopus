export function createReducer(initialState, handlers) {
  return function reducer(state = initialState, action) {
    // TODO: look up an own handler for action.type; guard against undefined
    throw new Error('createReducer: not implemented');
  };
}

export function combineReducers(reducers) {
  return function rootReducer(state = {}, action) {
    // BUG: a new object on every action re-renders everything
    const next = {};
    for (const key of Object.keys(reducers)) next[key] = reducers[key](state[key], action);
    return next;
  };
}

export function createAction(type, prepare) {
  // TODO: { type, payload }, .type, toString, .match
  throw new Error('createAction: not implemented');
}
