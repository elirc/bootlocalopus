export async function processInChunks(items, fn, { chunkSize = 100, signal, onProgress } = {}) {
  // TODO: this blocks the event loop until every item is done.
  // Process in chunks, yield with a macrotask between them, report progress,
  // and honour the abort signal.
  return items.map((item, i) => fn(item, i));
}
