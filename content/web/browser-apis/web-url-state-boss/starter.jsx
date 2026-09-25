export function parseState(search) {
  const params = new URLSearchParams(search);
  return {
    q: params.get('q') ?? '',
    tags: params.getAll('tag'),
    sort: params.get('sort') ?? 'relevance',
    page: Number(params.get('page') ?? 1),
  };
}

export function toSearch(state) {
  // TODO: canonical order, defaults omitted, '' when empty.
  throw new Error('not implemented');
}

export function startListPage({ fetchPage, render }) {
  // TODO: canonicalise the URL, load with abort + latest-only rendering,
  // update() with push/replace, popstate, stop().
  throw new Error('not implemented');
}
