export function createTypeahead({ search, render, delayMs = 250, setTimeout, clearTimeout }) {
  let current = '';
  let timer = null;
  let controller = null; // the latest request's controller
  let shown = [];
  let disposed = false;

  function show(state) {
    shown = state.results;
    render(state);
  }

  function cancelTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function abortInFlight() {
    controller?.abort();
    controller = null;
  }

  async function start(query) {
    timer = null;
    abortInFlight();
    const mine = new AbortController();
    controller = mine;
    current = query;
    show({ status: 'loading', query, results: shown });

    // Only the latest, un-aborted request may render: `search` might ignore
    // the signal, or resolve just before the abort.
    const isLatest = () => controller === mine && !mine.signal.aborted && !disposed;
    try {
      const results = await search(query, { signal: mine.signal });
      if (isLatest()) show({ status: 'success', query, results });
    } catch (error) {
      if (isLatest()) show({ status: 'error', query, results: [], error });
    }
  }

  return {
    input(text) {
      if (disposed) return;
      cancelTimer();
      const query = text.trim();
      if (query === current) return;
      if (query === '') {
        abortInFlight();
        current = '';
        show({ status: 'idle', query: '', results: [] });
        return;
      }
      timer = setTimeout(() => start(query), delayMs);
    },
    dispose() {
      disposed = true;
      cancelTimer();
      abortInFlight();
    },
  };
}
