/**
 * A stack of teardown steps. Steps run last-registered-first, one at a time,
 * and a failing step never stops the others from running.
 */
export function createCleanup() {
  const steps = [];

  function defer(fn) {
    if (typeof fn !== 'function') throw new TypeError('defer expects a function');
    const entry = { fn };
    steps.push(entry);
    return function cancel() {
      const i = steps.indexOf(entry);
      if (i !== -1) steps.splice(i, 1);
    };
  }

  async function run() {
    const errors = [];
    // pop() rather than a copied array: a step that defers another step
    // during the run gets it run next, in this same run.
    while (steps.length) {
      const { fn } = steps.pop();
      try {
        await fn();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, `${errors.length} cleanup step(s) failed`);
  }

  return { defer, run };
}

/**
 * Runs `body(defer)`, then always runs its cleanups. The body's own error
 * wins over cleanup errors; a clean body with a failing cleanup rejects.
 */
export async function withCleanup(body) {
  const cleanup = createCleanup();
  let result;
  try {
    result = await body(cleanup.defer);
  } catch (error) {
    await cleanup.run().catch(() => {});
    throw error;
  }
  await cleanup.run();
  return result;
}
