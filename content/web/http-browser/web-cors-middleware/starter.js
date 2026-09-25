export function withCors(options, handler) {
  return (req, res) => {
    // TODO: Vary: Origin on everything, preflight answered here (204 or 403),
    // and CORS headers for allowed origins before the handler runs.
    // This stub answers 501 so the tests fail fast.
    res.writeHead(501, { 'content-type': 'text/plain' });
    res.end('not implemented');
  };
}
