// A first attempt: one request per keystroke, and whichever answers last wins.
export function createTypeahead({ search, render, delayMs = 250, setTimeout, clearTimeout }) {
  return {
    async input(text) {
      const query = text.trim();
      render({ status: 'loading', query, results: [] });
      try {
        render({ status: 'success', query, results: await search(query, {}) });
      } catch (error) {
        render({ status: 'error', query, results: [], error });
      }
    },
    dispose() {},
  };
}
