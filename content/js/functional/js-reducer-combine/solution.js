export function createReducer(initialState, handlers) {
  return function reducer(state = initialState, action) {
    // Own properties only: action type 'toString' must not find Object.prototype.toString.
    if (!Object.hasOwn(handlers, action.type)) return state;
    const next = handlers[action.type](state, action);
    if (next === undefined) {
      throw new TypeError(`Reducer for "${action.type}" returned undefined; return the state (or null) instead`);
    }
    return next;
  };
}

export function combineReducers(reducers) {
  const keys = Object.keys(reducers);

  return function rootReducer(state = {}, action) {
    let changed = Object.keys(state).some((key) => !Object.hasOwn(reducers, key));
    const next = {};
    for (const key of keys) {
      const previous = state[key];
      const slice = reducers[key](previous, action);
      if (slice === undefined) {
        throw new Error(`Slice reducer "${key}" returned undefined for action "${action.type}"`);
      }
      next[key] = slice;
      if (slice !== previous) changed = true;
    }
    // Same reference when nothing changed: that is what lets selectors and memo skip work.
    return changed ? next : state;
  };
}

export function createAction(type, prepare) {
  function actionCreator(...args) {
    if (prepare) return { type, ...prepare(...args) };
    return { type, payload: args[0] };
  }
  actionCreator.type = type;
  actionCreator.toString = () => type;
  actionCreator.match = (action) => action != null && action.type === type;
  return actionCreator;
}
