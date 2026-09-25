export function throttle(fn, wait, { timers = globalThis } = {}) {
  let timer = null;   // non-null while a window is open
  let kept = null;    // { thisArg, args } of the latest call made during the window

  function openWindow() {
    timer = timers.setTimeout(closeWindow, wait);
  }

  function closeWindow() {
    timer = null;
    if (kept) {
      const { thisArg, args } = kept;
      kept = null;
      fn.apply(thisArg, args);
      openWindow(); // the trailing run counts as a run: keep the spacing
    }
  }

  function throttled(...args) {
    if (timer === null) {
      fn.apply(this, args);
      openWindow();
    } else {
      kept = { thisArg: this, args };
    }
  }

  throttled.cancel = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    kept = null;
  };

  return throttled;
}
