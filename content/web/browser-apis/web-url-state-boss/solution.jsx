const SORTS = new Set(['relevance', 'price-asc', 'price-desc', 'newest']);
const DEFAULT_SORT = 'relevance';
const FILTER_KEYS = ['q', 'tags', 'sort'];

export function parseState(search) {
  const params = new URLSearchParams(search);
  const tags = [...new Set(params.getAll('tag').map((t) => t.trim()).filter(Boolean))].sort();
  const sort = params.get('sort');
  const page = params.get('page') ?? '';
  return {
    q: (params.get('q') ?? '').trim(),
    tags,
    sort: SORTS.has(sort) ? sort : DEFAULT_SORT,
    page: /^\d+$/.test(page) && Number(page) >= 1 ? Number(page) : 1,
  };
}

export function toSearch({ q, tags, sort, page }) {
  const params = new URLSearchParams();
  if (q !== '') params.append('q', q);
  for (const tag of tags) params.append('tag', tag);
  if (sort !== DEFAULT_SORT) params.append('sort', sort);
  if (page !== 1) params.append('page', String(page));
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function startListPage({ fetchPage, render }) {
  let state = parseState(location.search);
  let controller = null;
  let shownItems = [];
  let stopped = false;

  function show(view) {
    if (stopped) return;
    shownItems = view.items;
    render(view);
  }

  async function load(next) {
    controller?.abort();
    const mine = new AbortController();
    controller = mine;
    state = next;
    show({ status: 'loading', state: next, items: shownItems });

    // The signal alone is not enough: fetchPage may ignore it.
    const isLatest = () => controller === mine && !mine.signal.aborted;
    try {
      const { items, total } = await fetchPage(next, { signal: mine.signal });
      if (isLatest()) show({ status: 'success', state: next, items, total });
    } catch (error) {
      if (isLatest()) show({ status: 'error', state: next, items: [], error });
    }
  }

  function update(patch, { replace = false } = {}) {
    // Normalise first, so `tags: ['b', 'a']` is not a change from ['a', 'b'].
    const next = parseState(toSearch({ ...state, ...patch }));
    const filtersChanged = FILTER_KEYS.some((key) => !sameValue(next[key], state[key]));
    if (filtersChanged && !('page' in patch)) next.page = 1;

    const search = toSearch(next);
    if (search === location.search) return; // never push the URL we are on
    const url = location.pathname + search;
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
    load(next);
  }

  function onPopState() {
    const next = parseState(location.search);
    if (toSearch(next) !== toSearch(state)) load(next);
  }

  // A pasted URL is input: write back its canonical form without a new entry.
  const canonical = toSearch(state);
  if (location.search !== canonical) {
    history.replaceState(history.state, '', location.pathname + canonical + location.hash);
  }
  window.addEventListener('popstate', onPopState);
  load(state);

  return {
    update,
    getState: () => state,
    stop() {
      stopped = true;
      window.removeEventListener('popstate', onPopState);
      controller?.abort();
    },
  };
}
