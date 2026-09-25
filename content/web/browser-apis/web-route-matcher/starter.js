// A first attempt: first match wins, nothing is decoded, and href is not written.
export function createRouter(routes) {
  return {
    match(href) {
      const [pathname] = href.split('?');
      for (const route of routes) {
        const pattern = route.path.split('/');
        const parts = pathname.split('/');
        if (pattern.length !== parts.length) continue;
        const params = {};
        const ok = pattern.every((segment, i) => {
          if (segment.startsWith(':')) { params[segment.slice(1)] = parts[i]; return true; }
          return segment === parts[i];
        });
        if (ok) return { name: route.name, params, query: {} };
      }
      return null;
    },
    href(name, params = {}) {
      throw new Error('not implemented');
    },
  };
}
