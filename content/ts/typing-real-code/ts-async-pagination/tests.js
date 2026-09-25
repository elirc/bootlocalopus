const { paginate, take, chunk } = solution;

// A fake API: pages keyed by cursor; `null` is the first page. Logs every fetch.
function fakeApi(pages) {
  const fetched = [];
  const fetchPage = async (cursor) => {
    fetched.push(cursor);
    const page = pages[cursor === null ? 'start' : cursor];
    if (!page) throw new Error(`unknown cursor ${cursor}`);
    return { items: [...page.items], nextCursor: page.next };
  };
  return { fetchPage, fetched };
}

const threePages = () => fakeApi({
  start: { items: [1, 2], next: 'p2' },
  p2: { items: [3, 4], next: 'p3' },
  p3: { items: [5], next: null },
});

async function collect(iterable) {
  const out = [];
  for await (const x of iterable) out.push(x);
  return out;
}

describe('paginate', () => {
  it('yields every item of every page, in order', async () => {
    const api = threePages();
    expect(await collect(paginate(api.fetchPage))).toEqual([1, 2, 3, 4, 5]);
    expect(api.fetched).toEqual([null, 'p2', 'p3']);
  });

  it('fetches nothing until the first item is requested', async () => {
    const api = threePages();
    const it = paginate(api.fetchPage);
    await Promise.resolve();
    expect(api.fetched).toEqual([]);
    expect(await it.next()).toEqual({ value: 1, done: false });
    expect(api.fetched).toEqual([null]);
  });

  it('fetches the next page only when the current one is used up', async () => {
    const api = threePages();
    const it = paginate(api.fetchPage);
    await it.next();
    await it.next();
    expect(api.fetched).toEqual([null]);
    expect((await it.next()).value).toBe(3);
    expect(api.fetched).toEqual([null, 'p2']);
  });

  it('keeps going past an empty page that still has a cursor', async () => {
    const api = fakeApi({
      start: { items: [], next: 'p2' },
      p2: { items: [], next: 'p3' },
      p3: { items: ['x'], next: null },
    });
    expect(await collect(paginate(api.fetchPage))).toEqual(['x']);
  });

  it('handles a single empty page', async () => {
    const api = fakeApi({ start: { items: [], next: null } });
    expect(await collect(paginate(api.fetchPage))).toEqual([]);
    expect(api.fetched).toEqual([null]);
  });

  it('refuses to loop forever when the API repeats a cursor', async () => {
    const api = fakeApi({
      start: { items: [1], next: 'a' },
      a: { items: [2], next: 'b' },
      b: { items: [3], next: 'a' },
    });
    const seen = [];
    let error;
    try {
      for await (const x of paginate(api.fetchPage)) seen.push(x);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('cursor repeated: a');
    expect(seen).toEqual([1, 2, 3]);
    expect(api.fetched).toEqual([null, 'a', 'b']);
  });

  it('passes a fetch failure through to the consumer', async () => {
    const api = fakeApi({ start: { items: [1], next: 'gone' } });
    const it = paginate(api.fetchPage);
    expect((await it.next()).value).toBe(1);
    await expect(it.next()).rejects.toThrow('unknown cursor gone');
  });
});

describe('take', () => {
  it('returns the first n items without fetching further pages', async () => {
    const api = threePages();
    expect(await take(paginate(api.fetchPage), 3)).toEqual([1, 2, 3]);
    expect(api.fetched).toEqual([null, 'p2']);
  });

  it('stops exactly at a page boundary', async () => {
    const api = threePages();
    expect(await take(paginate(api.fetchPage), 2)).toEqual([1, 2]);
    expect(api.fetched).toEqual([null]);
  });

  it('returns everything when there are fewer than n', async () => {
    const api = threePages();
    expect(await take(paginate(api.fetchPage), 50)).toEqual([1, 2, 3, 4, 5]);
  });

  it('pulls nothing for n <= 0', async () => {
    const api = threePages();
    expect(await take(paginate(api.fetchPage), 0)).toEqual([]);
    expect(await take(paginate(api.fetchPage), -1)).toEqual([]);
    expect(api.fetched).toEqual([]);
  });

  it('closes the source so its cleanup runs', async () => {
    let cleanedUp = false;
    async function* source() {
      try {
        yield 'a';
        yield 'b';
        yield 'c';
      } finally {
        cleanedUp = true;
      }
    }
    expect(await take(source(), 2)).toEqual(['a', 'b']);
    expect(cleanedUp).toBe(true);
  });

  it('accepts any async iterable, and pulls only what it needs', async () => {
    let pulls = 0;
    const iterable = {
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            pulls++;
            return pulls > 10 ? { value: undefined, done: true } : { value: pulls - 1, done: false };
          },
        };
      },
    };
    expect(await take(iterable, 3)).toEqual([0, 1, 2]);
    expect(pulls).toBe(3);
  });
});

describe('chunk', () => {
  it('groups items, with a shorter last chunk', async () => {
    const api = threePages();
    expect(await collect(chunk(paginate(api.fetchPage), 2))).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('yields no empty trailing chunk', async () => {
    const api = fakeApi({ start: { items: [1, 2, 3, 4], next: null } });
    expect(await collect(chunk(paginate(api.fetchPage), 2))).toEqual([[1, 2], [3, 4]]);
    const empty = fakeApi({ start: { items: [], next: null } });
    expect(await collect(chunk(paginate(empty.fetchPage), 3))).toEqual([]);
  });

  it('is lazy: a chunk is yielded as soon as it is full', async () => {
    const api = threePages();
    const it = chunk(paginate(api.fetchPage), 2);
    expect((await it.next()).value).toEqual([1, 2]);
    expect(api.fetched).toEqual([null]);
  });

  it('rejects a size below 1 or a fraction', async () => {
    const api = threePages();
    await expect(chunk(paginate(api.fetchPage), 0).next()).rejects.toThrow();
    await expect(chunk(paginate(api.fetchPage), 1.5).next()).rejects.toThrow();
    let caught;
    try { await chunk(paginate(api.fetchPage), 0).next(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(RangeError);
  });
});
