export function once(target, eventName, { signal, filter } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const isEventTarget = typeof target.addEventListener === 'function';
    const listen = isEventTarget
      ? (name, fn) => target.addEventListener(name, fn)
      : (name, fn) => target.on(name, fn);
    const unlisten = isEventTarget
      ? (name, fn) => target.removeEventListener(name, fn)
      : (name, fn) => target.off(name, fn);
    const rejectOnError = !isEventTarget && eventName !== 'error';

    // Every exit goes through here, so nothing can be left attached.
    const cleanup = () => {
      unlisten(eventName, onEvent);
      if (rejectOnError) unlisten('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const fail = (error) => {
      cleanup();
      reject(error);
    };

    function onEvent(...args) {
      const payload = isEventTarget ? args[0] : args;
      if (filter) {
        let matches;
        try {
          matches = filter(payload);
        } catch (error) {
          fail(error);
          return;
        }
        if (!matches) return;
      }
      cleanup();
      resolve(payload);
    }
    function onError(error) {
      fail(error);
    }
    function onAbort() {
      fail(signal.reason);
    }

    listen(eventName, onEvent);
    if (rejectOnError) listen('error', onError);
    signal?.addEventListener('abort', onAbort);
  });
}
