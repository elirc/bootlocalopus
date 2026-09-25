export function createAssetHandler(assets) {
  return (req, res) => {
    // TODO: 405 / 404, content-length in bytes, a strong ETag, cache-control by
    // path, 304 on If-None-Match, and HEAD without a body.
    // This stub answers 501 so the tests fail fast.
    res.writeHead(501, { 'content-type': 'text/plain' });
    res.end('not implemented');
  };
}
