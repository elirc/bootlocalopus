const currentLocation = () => location.pathname + location.search + location.hash;
const locationOf = (url) => url.pathname + url.search + url.hash;

export function startNavigation({ root = document, onNavigate }) {
  function navigate(to, { replace = false } = {}) {
    const url = new URL(to, location.href);
    if (url.origin !== location.origin) throw new TypeError(`Cannot navigate to another origin: ${url.href}`);
    const next = locationOf(url);
    // Pushing the page you are already on would make Back look broken.
    if (replace || next === currentLocation()) history.replaceState(null, '', next);
    else history.pushState(null, '', next);
    onNavigate(next);
  }

  function onClick(event) {
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    // The target may be an <svg> or <span> inside the link.
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || !root.contains(link)) return;

    const target = (link.getAttribute('target') ?? '').toLowerCase();
    if ((target !== '' && target !== '_self') || link.hasAttribute('download')) return;

    const url = new URL(link.href);
    if (url.origin !== location.origin) return; // other sites, mailto:, tel:

    // An in-page anchor: let the browser scroll.
    if (url.hash && url.pathname === location.pathname && url.search === location.search) return;

    event.preventDefault();
    navigate(locationOf(url));
  }

  function onPopState() {
    onNavigate(currentLocation());
  }

  root.addEventListener('click', onClick);
  window.addEventListener('popstate', onPopState);

  return {
    navigate,
    stop() {
      root.removeEventListener('click', onClick);
      window.removeEventListener('popstate', onPopState);
    },
  };
}
