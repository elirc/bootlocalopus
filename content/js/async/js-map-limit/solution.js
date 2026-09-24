export async function mapLimit(items, limit, fn) {
  const list = [...items];
  const results = new Array(list.length);
  if (list.length === 0) return results;

  const size = Math.max(1, Math.min(limit, list.length));
  let cursor = 0;

  // Each worker pulls the next index as soon as it is free, so a single slow
  // item never idles the rest of the pool the way fixed batching would.
  const worker = async () => {
    while (cursor < list.length) {
      const index = cursor++;
      results[index] = await fn(list[index], index);
    }
  };

  await Promise.all(Array.from({ length: size }, worker));
  return results;
}
