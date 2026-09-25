const STATIC = 0;
const PARAM = 1;
const SPLAT = 2;

const splitPath = (path) => {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? [] : trimmed.split('/');
};

function compile({ name, path }) {
  const segments = splitPath(path).map((segment, i, all) => {
    if (segment === '*') {
      if (i !== all.length - 1) throw new Error(`"*" must be the last segment in ${path}`);
      return { type: SPLAT };
    }
    if (segment.startsWith(':')) return { type: PARAM, name: segment.slice(1) };
    return { type: STATIC, value: segment };
  });
  return { name, segments };
}

/** Returns the params, or null. Never throws: a bad escape is simply no match. */
function matchRoute(route, parts) {
  const params = {};
  try {
    for (let i = 0; i < route.segments.length; i++) {
      const segment = route.segments[i];
      if (segment.type === SPLAT) {
        params['*'] = parts.slice(i).map(decodeURIComponent).join('/');
        return params;
      }
      const part = parts[i];
      if (part === undefined || part === '') return null;
      if (segment.type === STATIC) {
        if (part !== segment.value) return null;
      } else {
        params[segment.name] = decodeURIComponent(part);
      }
    }
  } catch {
    return null; // URIError from a malformed %-escape
  }
  return parts.length === route.segments.length ? params : null;
}

/** Negative when `a` is more specific than `b`. */
function compareSpecificity(a, b) {
  const length = Math.max(a.segments.length, b.segments.length);
  for (let i = 0; i < length; i++) {
    // A pattern that has ended can only be competing with a `*` here.
    const rankA = a.segments[i]?.type ?? STATIC;
    const rankB = b.segments[i]?.type ?? STATIC;
    if (rankA !== rankB) return rankA - rankB;
  }
  return 0;
}

export function createRouter(routes) {
  // A stable sort keeps declaration order between routes of the same shape.
  const table = routes.map(compile).sort(compareSpecificity);
  const byName = new Map(table.map((route) => [route.name, route]));

  function match(href) {
    const url = new URL(href, 'http://router.invalid');
    const parts = splitPath(url.pathname);
    for (const route of table) {
      const params = matchRoute(route, parts);
      if (params) return { name: route.name, params, query: Object.fromEntries(url.searchParams) };
    }
    return null;
  }

  function href(name, params = {}) {
    const route = byName.get(name);
    if (!route) throw new Error(`Unknown route "${name}"`);
    const parts = route.segments.map((segment) => {
      if (segment.type === STATIC) return segment.value;
      if (segment.type === SPLAT) {
        return String(params['*'] ?? '').split('/').map(encodeURIComponent).join('/');
      }
      const value = params[segment.name];
      if (value === undefined || value === null || String(value) === '') {
        throw new Error(`Missing param "${segment.name}" for route "${name}"`);
      }
      return encodeURIComponent(String(value));
    });
    return '/' + parts.join('/');
  }

  return { match, href };
}
