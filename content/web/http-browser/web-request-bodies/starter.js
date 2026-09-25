export function createRequest(url, options = {}) {
  // A first attempt: it forgets the JSON content type, sets a multipart type
  // by hand and trusts the method as written.
  let body;
  if (options.json) body = JSON.stringify(options.json);
  if (options.form) body = new URLSearchParams(options.form);
  if (options.multipart) body = new FormData();
  return new Request(url, {
    method: options.method ?? 'GET',
    headers: { ...options.headers, ...(options.multipart ? { 'content-type': 'multipart/form-data' } : {}) },
    body,
  });
}
