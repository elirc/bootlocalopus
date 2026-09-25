export function debounce(fn, wait, { leading = false, trailing = true, timers = globalThis } = {}) {
  let timer = null;     // non-null while a burst is in progress
  let pending = null;   // { thisArg, args } of the latest call not yet delivered

  function endBurst() {
    timer = null;
    if (trailing && pending) {
      const { thisArg, args } = pending;
      pending = null;
      return fn.apply(thisArg, args);
    }
    pending = null;
    return undefined;
  }

  function debounced(...args) {
    const startsBurst = timer === null;
    if (!startsBurst) timers.clearTimeout(timer);
    timer = timers.setTimeout(endBurst, wait);

    if (startsBurst && leading) {
      pending = null; // delivered right now; only later calls make a trailing call
      fn.apply(this, args);
    } else {
      pending = { thisArg: this, args };
    }
  }

  debounced.cancel = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    pending = null;
  };

  debounced.flush = () => {
    if (timer === null) return undefined;
    timers.clearTimeout(timer);
    return endBurst();
  };

  return debounced;
}
