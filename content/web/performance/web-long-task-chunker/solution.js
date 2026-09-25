export async function processInChunks(items, fn, { budgetMs = 50, now, yieldToMain, signal } = {}) {
  signal?.throwIfAborted(); // rejects with signal.reason

  const results = [];
  let sliceStart = now();

  for (let index = 0; index < items.length; index++) {
    // Check before each item except the first: at least one item per slice,
    // and never a pointless yield after the last one.
    if (index > 0 && now() - sliceStart >= budgetMs) {
      await yieldToMain(); // let the browser handle input and paint
      signal?.throwIfAborted();
      sliceStart = now();
    }
    results.push(fn(items[index], index));
  }

  return results;
}
