export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export class NetworkError extends Error {
  constructor(url, cause) {
    super(`Network error for ${url}`, { cause });
    this.name = 'NetworkError';
    this.url = url;
  }
}

export class ContentTypeError extends Error {
  constructor(url, status, contentType) {
    super(`Expected JSON from ${url}`);
    this.name = 'ContentTypeError';
    this.url = url;
    this.status = status;
    this.contentType = contentType;
  }
}

const isJsonType = (contentType) => {
  if (!contentType) return false;
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  return mediaType === 'application/json' || mediaType.endsWith('+json');
};

export async function fetchJson(fetchImpl, url, init = {}) {
  // `Headers` accepts all three shapes callers use and compares names
  // case-insensitively, so `has('accept')` also sees `Accept`.
  const headers = new Headers(init.headers);
  if (!headers.has('accept')) headers.set('accept', 'application/json');

  let response;
  try {
    response = await fetchImpl(url, { ...init, headers });
  } catch (error) {
    // A cancellation is not a failure: hand it back untouched.
    if (error?.name === 'AbortError') throw error;
    throw new NetworkError(url, error);
  }

  // The body is a stream: read it exactly once and decide what it is afterwards.
  const text = await response.text();
  const contentType = response.headers.get('content-type');
  const json = isJsonType(contentType);

  if (!response.ok) {
    let body = text === '' ? null : text;
    if (json && text !== '') {
      try { body = JSON.parse(text); } catch { /* an error page that lies about its type: keep the text */ }
    }
    throw new HttpError(response.status, url, body);
  }

  if (response.status === 204 || response.status === 205 || text === '') return null;
  if (!json) throw new ContentTypeError(url, response.status, contentType);
  return JSON.parse(text);
}
