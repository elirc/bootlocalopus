export function contentDisposition(filename, { inline = false } = {}) {
  // TODO: clean the name, then emit filename="…" (and filename*=UTF-8''… when needed).
  throw new Error('contentDisposition is not implemented yet');
}

export function createDownloadHandler(getFile) {
  return (req, res) => {
    res.writeHead(501, { 'content-type': 'text/plain' });
    res.end('not implemented');
  };
}
