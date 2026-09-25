export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type FetchPage<T> = (cursor: string | null) => Promise<Page<T>>;

// Loads EVERY page before yielding anything, so `take(…, 3)` still downloads
// the whole collection, and a repeated cursor spins forever.
export async function* paginate<T>(fetchPage: FetchPage<T>): AsyncGenerator<T, void, undefined> {
  const all: T[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page: Page<T> = await fetchPage(cursor);
    all.push(...page.items);
    cursor = page.nextCursor;
    if (++pages > 100) throw new Error('too many pages'); // a safety net, not a fix
  } while (cursor !== null);
  yield* all;
}

export async function take<T>(source: AsyncIterable<T>, n: number): Promise<T[]> {
  const all: T[] = [];
  for await (const item of source) all.push(item);
  return all.slice(0, n);
}

export async function* chunk<T>(source: AsyncIterable<T>, size: number): AsyncGenerator<T[], void, undefined> {
  throw new Error('not implemented');
}
