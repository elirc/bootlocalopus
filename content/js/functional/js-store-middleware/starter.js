export function createStore(reducer, { preloadedState, middleware = [] } = {}) {
  // TODO:
  // - initialise with reducer(preloadedState, { type: '@@store/init' })
  // - a base dispatch that validates, guards the reducer, and notifies on change
  // - subscribe / unsubscribe with the notification-round rules
  // - compose middleware (api) => (next) => (action) around the base dispatch
  throw new Error('createStore: not implemented');
}

export const thunk = (api) => (next) => (action) => {
  // TODO: run functions, pass everything else on
  throw new Error('thunk: not implemented');
};
