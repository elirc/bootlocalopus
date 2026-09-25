import http from 'node:http';

export function contentDisposition(name, { inline = false } = {}) {
  // What most codebases have. Try it with a quote, a newline or an accent.
  return `${inline ? 'inline' : 'attachment'}; filename="${name}"`;
}

export function createDownloadServer(files) {
  return http.createServer((req, res) => {
    // TODO: GET /download/<id> as described in the brief.
    res.writeHead(501);
    res.end();
  });
}
