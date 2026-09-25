export function debounce(fn, wait, { leading = false, trailing = true, timers = globalThis } = {}) {
  // TODO: a timer id, the pending arguments and `this`, and a leading flag.
  function debounced(...args) {
    throw new Error('not implemented');
  }
  debounced.cancel = () => {};
  debounced.flush = () => undefined;
  return debounced;
}
