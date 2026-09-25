const DOT_SEGMENTS = new Set(['', '.', '..']);

/** Appends `value` under `key`: skips null/undefined, one entry per array element. */
function appendParam(params, key, value) {
  for (const item of Array.isArray(value) ? value : [value]) {
    if (item === undefined || item === null) continue;
    params.append(key, String(item));
  }
}

export function apiUrl(base, segments, query = {}) {
  const url = new URL(base);

  const encoded = segments.map((segment) => {
    const text = String(segment);
    // Encoding does not help here: '..' is still '..', and the URL parser
    // would resolve it and climb out of the prefix.
    if (DOT_SEGMENTS.has(text)) throw new TypeError(`Invalid path segment: "${text}"`);
    return encodeURIComponent(text);
  });

  // Append to the prefix instead of resolving against it: resolution would
  // drop the last segment of a base without a trailing slash.
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${encoded.join('/')}`;

  for (const [key, value] of Object.entries(query)) appendParam(url.searchParams, key, value);
  return url.href;
}

export function withQuery(href, patch) {
  const url = new URL(href);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) {
      url.searchParams.delete(key);
    } else if (Array.isArray(value)) {
      url.searchParams.delete(key);
      appendParam(url.searchParams, key, value);
    } else {
      // `set` replaces every value of the key, keeping the first one's position.
      url.searchParams.set(key, String(value));
    }
  }
  return url.href;
}
