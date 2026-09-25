export function createStore(initialState) {
  let state = initialState;
  // A Set keeps insertion order and makes unsubscribe O(1). Each entry is a
  // fresh wrapper object, so subscribing the same function twice gives two
  // independent subscriptions.
  const listeners = new Set();
  let batchDepth = 0;
  let stateBeforeBatch = state;

  function notify(prev) {
    if (Object.is(prev, state)) return;
    const current = state;
    for (const entry of [...listeners]) {
      if (listeners.has(entry)) entry.call(current, prev);
    }
  }

  function add(entry) {
    listeners.add(entry);
    return () => { listeners.delete(entry); };
  }

  function setState(update) {
    const prev = state;
    if (typeof update === 'function') {
      state = update(prev);
    } else {
      const changed = Object.keys(update).some((key) => !Object.is(prev[key], update[key]));
      if (changed) state = { ...prev, ...update };
    }
    if (batchDepth === 0) notify(prev);
  }

  return {
    getState: () => state,
    setState,
    subscribe(listener) {
      return add({ call: (next, prev) => listener(next, prev) });
    },
    select(selector, listener, equals = Object.is) {
      let last = selector(state);
      return add({
        call(next) {
          const selected = selector(next);
          if (equals(last, selected)) return;
          const previous = last;
          last = selected;
          listener(selected, previous);
        },
      });
    },
    batch(fn) {
      if (batchDepth === 0) stateBeforeBatch = state;
      batchDepth++;
      try {
        return fn();
      } finally {
        batchDepth--;
        if (batchDepth === 0) notify(stateBeforeBatch);
      }
    },
  };
}
