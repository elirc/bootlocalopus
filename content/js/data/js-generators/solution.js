export async function* paginate(fetchPage) {
  let cursor;
  while (true) {
    const page = await fetchPage(cursor);
    yield* page.items;
    if (page.nextCursor == null) return;
    cursor = page.nextCursor;
  }
}

export async function take(n, iterable) {
  const out = [];
  if (n <= 0) return out;
  for await (const item of iterable) {
    out.push(item);
    // Breaking closes the generator, so no further pages are fetched.
    if (out.length >= n) break;
  }
  return out;
}

export function* chunk(iterable, size) {
  let batch = [];
  for (const item of iterable) {
    batch.push(item);
    if (batch.length === size) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length) yield batch;
}
