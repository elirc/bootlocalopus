const BODY_OPTIONS = ['json', 'form', 'multipart'];

/** Calls `append(key, value)` for each entry, flattening arrays and skipping null/undefined. */
function eachEntry(object, append) {
  for (const [key, raw] of Object.entries(object)) {
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      if (value === null || value === undefined) continue;
      append(key, value);
    }
  }
}

export function createRequest(url, options = {}) {
  // `in`, not truthiness: `json: false` and `json: null` are real bodies.
  const kinds = BODY_OPTIONS.filter((kind) => kind in options);
  if (kinds.length > 1) throw new TypeError(`Pass only one of ${kinds.join(', ')}`);
  const kind = kinds[0];

  const headers = new Headers(options.headers);
  let body;

  if (kind === 'json') {
    body = JSON.stringify(options.json);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  } else if (kind === 'form') {
    // URLSearchParams sets application/x-www-form-urlencoded;charset=UTF-8.
    body = new URLSearchParams();
    eachEntry(options.form, (key, value) => body.append(key, String(value)));
  } else if (kind === 'multipart') {
    body = new FormData();
    eachEntry(options.multipart, (key, value) => {
      if (value instanceof Blob) body.append(key, value); // a File keeps its name
      else body.append(key, String(value));
    });
    // Only the runtime knows the boundary; a hand-written type would lack it.
    headers.delete('content-type');
  }

  const method = (options.method ?? (kind ? 'POST' : 'GET')).toUpperCase();
  // The Request constructor throws a TypeError for a body on GET/HEAD.
  return new Request(url, { method, headers, body });
}
