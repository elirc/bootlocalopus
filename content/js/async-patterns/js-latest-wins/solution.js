export class SupersededError extends Error {
  constructor(message = 'superseded by a newer call') {
    super(message);
    this.name = 'SupersededError';
  }
}

export function latestOnly(fn) {
  let current = null; // { controller, reject } of the call that may still deliver

  function supersede() {
    if (!current) return;
    const { controller, reject } = current;
    current = null;
    const reason = new SupersededError();
    controller.abort(reason);
    reject(reason);
  }

  function run(...args) {
    supersede();
    const controller = new AbortController();
    return new Promise((resolve, reject) => {
      const entry = { controller, reject };
      current = entry;
      let result;
      try {
        result = fn(...args, { signal: controller.signal });
      } catch (error) {
        result = Promise.reject(error);
      }
      // Settle only if nothing has superseded this call in the meantime.
      Promise.resolve(result).then(
          (value) => { if (current === entry) { current = null; resolve(value); } },
          (error) => { if (current === entry) { current = null; reject(error); } },
        );
    });
  }

  run.cancel = supersede;
  return run;
}
