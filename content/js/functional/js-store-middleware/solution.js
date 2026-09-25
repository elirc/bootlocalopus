const isPlainObject = (v) => {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

export function createStore(reducer, { preloadedState, middleware = [] } = {}) {
  let state;
  let reducing = false;
  const listeners = new Set();

  const assertNotReducing = (what) => {
    if (reducing) throw new Error(`You may not call ${what} while the reducer is running`);
  };

  function getState() {
    assertNotReducing('getState()');
    return state;
  }

  function subscribe(listener) {
    assertNotReducing('subscribe()');
    // Wrap so the same function can be subscribed twice and removed independently.
    const entry = () => listener();
    listeners.add(entry);
    return () => {
      listeners.delete(entry);
    };
  }

  function baseDispatch(action) {
    if (!isPlainObject(action)) {
      throw new TypeError('Actions must be plain objects; use the thunk middleware for functions');
    }
    if (typeof action.type !== 'string') {
      throw new TypeError('Actions must have a string `type`');
    }
    assertNotReducing('dispatch()');

    const previous = state;
    reducing = true;
    try {
      state = reducer(state, action);
    } finally {
      // Reset even if the reducer threw, or the store is stuck forever.
      reducing = false;
    }

    if (state !== previous) {
      for (const entry of [...listeners]) {
        if (listeners.has(entry)) entry(); // skip anyone unsubscribed earlier in this round
      }
    }
    return action;
  }

  // Initialise before middleware exists, straight through the reducer.
  reducing = true;
  try {
    state = reducer(preloadedState, { type: '@@store/init' });
  } finally {
    reducing = false;
  }

  let dispatch = () => {
    throw new Error('Dispatching while constructing your middleware is not allowed');
  };
  // `api.dispatch` calls whatever `dispatch` is *now*, i.e. the full chain once built.
  const api = { getState, dispatch: (action) => dispatch(action) };
  const chain = middleware.map((mw) => mw(api));
  dispatch = chain.reduceRight((next, link) => link(next), baseDispatch);

  return { getState, dispatch: (action) => dispatch(action), subscribe };
}

export const thunk = ({ dispatch, getState }) => (next) => (action) =>
  typeof action === 'function' ? action(dispatch, getState) : next(action);
