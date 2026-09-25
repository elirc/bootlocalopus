export function startNavigation({ root = document, onNavigate }) {
  // TODO: one delegated click listener on `root`, a popstate listener on
  // `window`, and navigate() with pushState / replaceState.
  return {
    navigate(to, { replace = false } = {}) {
      throw new Error('not implemented');
    },
    stop() {},
  };
}
