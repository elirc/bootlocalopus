// A first attempt that works for the happy path and nothing else.

export function apiUrl(base, segments, query = {}) {
  return new URL(segments.join('/'), base).href + '?' + new URLSearchParams(query);
}

export function withQuery(href, patch) {
  const [path] = href.split('?');
  return path + '?' + new URLSearchParams(patch);
}
