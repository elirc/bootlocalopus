export class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function withTimeout(fn, ms, { signal, timers = globalThis } = {}) {
  if (signal?.aborted) return Promise.reject(signal.reason);

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;

    const finish = (settle, value) => {
      if (settled) return;
      settled = true;
      timers.clearTimeout(timer);
      signal?.removeEventListener('abort', onParentAbort);
      settle(value);
    };

    const onParentAbort = () => {
      controller.abort(signal.reason);
      finish(reject, signal.reason);
    };

    const timer = timers.setTimeout(() => {
      const error = new TimeoutError(`timed out after ${ms}ms`);
      controller.abort(error);
      finish(reject, error);
    }, ms);

    signal?.addEventListener('abort', onParentAbort);

    let work;
    try {
      work = Promise.resolve(fn(controller.signal));
    } catch (error) {
      work = Promise.reject(error);
    }
    work.then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}
