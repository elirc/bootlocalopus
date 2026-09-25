export class SupersededError extends Error {}

export function latestOnly(fn) {
  const run = (...args) => {
    // Every call's result is delivered, in whatever order they finish.
    return Promise.resolve().then(() => fn(...args, { signal: new AbortController().signal }));
  };
  run.cancel = () => {};
  return run;
}
