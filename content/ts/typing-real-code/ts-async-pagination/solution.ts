export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type FetchPage<T> = (cursor: string | null) => Promise<Page<T>>;

/**
 * Every item of every page, fetched lazily: a page is requested only when the
 * consumer asks for an item past the end of the previous one.
 */
export async function* paginate<T>(fetchPage: FetchPage<T>): AsyncGenerator<T, void, undefined> {
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: Page<T> = await fetchPage(cursor);
    yield* page.items;
    cursor = page.nextCursor;
    if (cursor !== null) {
      // A buggy API that hands back an old cursor would loop forever.
      if (seen.has(cursor)) throw new Error(`cursor repeated: ${cursor}`);
      seen.add(cursor);
    }
  } while (cursor !== null);
}

/** The first `n` items; stops pulling (and closes the source) as soon as it has them. */
export async function take<T>(source: AsyncIterable<T>, n: number): Promise<T[]> {
  const out: T[] = [];
  if (n <= 0) return out;
  for await (const item of source) {
    out.push(item);
    if (out.length >= n) break; // `break` calls the iterator's return(), running its finally blocks
  }
  return out;
}

/** Groups items into arrays of `size`; the last one may be shorter. */
export async function* chunk<T>(source: AsyncIterable<T>, size: number): AsyncGenerator<T[], void, undefined> {
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`chunk size must be a positive integer, got ${size}`);
  let batch: T[] = [];
  for await (const item of source) {
    batch.push(item);
    if (batch.length === size) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) yield batch;
}
