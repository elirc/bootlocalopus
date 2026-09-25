/**
 * A stack of teardown steps. Steps run last-registered-first, one at a time,
 * and a failing step never stops the others from running.
 */
export function createCleanup() {
  const steps = [];

  function defer(fn) {
    steps.push(fn);
    return () => {};
  }

  // The teardown in the old afterEach: first in, first out, all at once,
  // and the first failure hides every other one.
  async function run() {
    await Promise.all(steps.map((fn) => fn()));
  }

  return { defer, run };
}

/** Runs `body(defer)`, then always runs its cleanups. */
export async function withCleanup(body) {
  throw new Error('not implemented');
}
