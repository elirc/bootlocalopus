export function createApi({ origins, products }) {
  return (req, res) => {
    // TODO: CORS (Vary, preflight, headers on every response for allowed
    // origins), GET with ETag / 304, PUT with If-Match (428, 412), 415, 400,
    // 404 and 405. This stub answers 501 so the tests fail fast.
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  };
}
