export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function createHttpCache({ fetch, now = Date.now }) {
  return {
    // No cache yet: every call goes to the network.
    async get(url) {
      const response = await fetch(url, { headers: {} });
      if (!response.ok) throw new HttpError(response.status, url);
      return response.json();
    },
  };
}
