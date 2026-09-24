export function createApp() {
  const middleware = [];
  const errorHandlers = [];

  return {
    use(fn) {
      // TODO
    },
    useError(fn) {
      // TODO
    },
    async handle(req, res) {
      // TODO: walk the chain, then the error chain, then the fallbacks.
      // (This stub answers 501 so the tests fail fast instead of hanging.)
      res.writeHead(501, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not implemented' }));
    },
  };
}
