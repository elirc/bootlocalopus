export function safeNext(value) {
  // TODO: only same-origin paths survive; everything else becomes '/'.
  throw new Error('safeNext is not implemented yet');
}

export function createRedirectHandler({ checkPassword }) {
  return async (req, res) => {
    // TODO: POST /login -> 303 to safeNext(next); trailing slashes -> 301/308.
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  };
}
