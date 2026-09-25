export function throttle(fn, wait, { timers = globalThis } = {}) {
  let last = -Infinity;
  function throttled(...args) {
    // Drops every call inside the window, including the last one. Fix it.
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn.apply(this, args);
    }
  }
  throttled.cancel = () => {};
  return throttled;
}
