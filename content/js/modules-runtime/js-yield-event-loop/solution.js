// A macrotask: timers, I/O and new connections get a turn before we resume.
// (`await Promise.resolve()` would be a microtask and let nothing else run.)
const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

export async function processInChunks(items, fn, { chunkSize = 100, signal, onProgress } = {}) {
  signal?.throwIfAborted(); // rejects with signal.reason
  const results = new Array(items.length);
  let index = 0;

  while (index < items.length) {
    signal?.throwIfAborted();

    const end = Math.min(index + chunkSize, items.length);
    for (; index < end; index++) {
      results[index] = fn(items[index], index);
    }
    onProgress?.(index, items.length);

    if (index < items.length) await yieldToEventLoop();
  }
  return results;
}
