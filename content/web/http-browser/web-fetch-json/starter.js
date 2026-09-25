export class HttpError extends Error {}
export class NetworkError extends Error {}
export class ContentTypeError extends Error {}

export async function fetchJson(fetchImpl, url, init = {}) {
  // This is the version most codebases start with. It treats a 404 as success,
  // parses an HTML page as JSON and turns every failure into a SyntaxError.
  const response = await fetchImpl(url, init);
  return response.json();
}
