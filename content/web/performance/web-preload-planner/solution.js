const MAX_PRECONNECTS = 4;

/** Fonts, fetches and module scripts are always requested in CORS mode. */
const isCors = (resource) =>
  resource.type === 'font' || resource.type === 'fetch' || (resource.type === 'script' && resource.module === true);

function fontType(url) {
  const { pathname } = new URL(url);
  if (pathname.endsWith('.woff2')) return 'font/woff2';
  if (pathname.endsWith('.woff')) return 'font/woff';
  return undefined;
}

function preloadFor(resource) {
  const href = resource.url;
  switch (resource.type) {
    case 'image': {
      if (!resource.lcp) return null;
      const hint = { rel: 'preload', as: 'image', href, fetchpriority: 'high' };
      // Without these, the preload fetches `href` and the <img> then picks
      // a different srcset candidate: two downloads.
      if (resource.srcset) hint.imagesrcset = resource.srcset;
      if (resource.sizes) hint.imagesizes = resource.sizes;
      return hint;
    }
    case 'font': {
      const hint = { rel: 'preload', as: 'font', href, crossorigin: 'anonymous' };
      const type = fontType(href);
      if (type) hint.type = type;
      return hint;
    }
    case 'script':
      return resource.module ? { rel: 'modulepreload', href } : { rel: 'preload', as: 'script', href };
    case 'style':
      return { rel: 'preload', as: 'style', href };
    case 'fetch':
      return { rel: 'preload', as: 'fetch', href, crossorigin: 'anonymous' };
    default:
      return null;
  }
}

export function planResourceHints(pageOrigin, resources) {
  const critical = resources.filter((resource) => resource.critical);

  // One connection pool per (origin, CORS mode) pair.
  const pairs = [];
  const seenPairs = new Set();
  for (const resource of critical) {
    const origin = new URL(resource.url).origin;
    if (origin === pageOrigin) continue;
    const cors = isCors(resource);
    const key = `${cors}|${origin}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    pairs.push({ origin, cors });
  }

  const connections = [];
  const preconnected = new Set();
  const prefetched = new Set();
  pairs.forEach(({ origin, cors }, i) => {
    if (i < MAX_PRECONNECTS) {
      connections.push(cors ? { rel: 'preconnect', href: origin, crossorigin: 'anonymous' } : { rel: 'preconnect', href: origin });
      preconnected.add(origin);
    }
  });
  pairs.slice(MAX_PRECONNECTS).forEach(({ origin }) => {
    if (preconnected.has(origin) || prefetched.has(origin)) return;
    prefetched.add(origin);
    connections.push({ rel: 'dns-prefetch', href: origin });
  });

  const preloads = [];
  const seenUrls = new Set();
  for (const resource of critical) {
    if (seenUrls.has(resource.url)) continue;
    const hint = preloadFor(resource);
    if (!hint) continue;
    seenUrls.add(resource.url);
    preloads.push(hint);
  }

  return [...connections, ...preloads];
}
