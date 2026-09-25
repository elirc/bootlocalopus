// A first attempt: yields every 100 items, whatever they cost.
export async function processInChunks(items, fn, { budgetMs = 50, now, yieldToMain, signal } = {}) {
  const results = [];
  for (let index = 0; index < items.length; index++) {
    if (index % 100 === 99) await Promise.resolve();
    results.push(fn(items[index], index));
  }
  return results;
}
