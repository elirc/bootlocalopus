export function createStore(initialState) {
  let state = initialState;

  return {
    getState: () => state,
    setState(update) {
      // TODO: apply the update, then notify listeners
      throw new Error('TODO');
    },
    subscribe(listener) {
      throw new Error('TODO');
    },
    select(selector, listener, equals = Object.is) {
      throw new Error('TODO');
    },
    batch(fn) {
      throw new Error('TODO');
    },
  };
}
