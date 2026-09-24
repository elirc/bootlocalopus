const makeSource = () => {
  const pages = {
    undefined: { items: [1, 2], nextCursor: 'p2' },
    p2: { items: [3, 4], nextCursor: 'p3' },
    p3: { items: [5], nextCursor: null },
  };
  const calls = [];
  return {
    calls,
    fetchPage: async (cursor) => {
      calls.push(cursor);
      return pages[String(cursor)];
    },
  };
};

describe('paginate', () => {
  it('yields every item across every page', async () => {
    const src = makeSource();
    const out = [];
    for await (const item of solution.paginate(src.fetchPage)) out.push(item);
    expect(out).toEqual([1, 2, 3, 4, 5]);
  });

  it('starts with an undefined cursor and follows nextCursor', async () => {
    const src = makeSource();
    for await (const _ of solution.paginate(src.fetchPage)) { /* drain */ }
    expect(src.calls).toEqual([undefined, 'p2', 'p3']);
  });

  it('is lazy: nothing is fetched until the first pull', async () => {
    const src = makeSource();
    const gen = solution.paginate(src.fetchPage);
    expect(src.calls).toEqual([]);
    await gen.next();
    expect(src.calls).toEqual([undefined]);
  });

  it('handles an empty first page', async () => {
    const out = [];
    for await (const item of solution.paginate(async () => ({ items: [], nextCursor: null }))) {
      out.push(item);
    }
    expect(out).toEqual([]);
  });
});

describe('take', () => {
  it('collects at most n items', async () => {
    const src = makeSource();
    expect(await solution.take(3, solution.paginate(src.fetchPage))).toEqual([1, 2, 3]);
  });

  it('stops fetching pages it does not need', async () => {
    const src = makeSource();
    await solution.take(2, solution.paginate(src.fetchPage));
    expect(src.calls).toEqual([undefined]);
  });

  it('returns everything if n exceeds the source', async () => {
    const src = makeSource();
    expect(await solution.take(99, solution.paginate(src.fetchPage))).toEqual([1, 2, 3, 4, 5]);
  });

  it('take(0) consumes nothing', async () => {
    const src = makeSource();
    expect(await solution.take(0, solution.paginate(src.fetchPage))).toEqual([]);
    expect(src.calls).toEqual([]);
  });
});

describe('chunk', () => {
  it('batches into fixed sizes', () => {
    expect([...solution.chunk([1, 2, 3, 4, 5, 6], 2)]).toEqual([[1, 2], [3, 4], [5, 6]]);
  });
  it('keeps a short final batch', () => {
    expect([...solution.chunk([1, 2, 3, 4, 5], 2)]).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('handles an empty input', () => {
    expect([...solution.chunk([], 3)]).toEqual([]);
  });
  it('works with any iterable', () => {
    expect([...solution.chunk(new Set([1, 2, 3]), 2)]).toEqual([[1, 2], [3]]);
  });
});