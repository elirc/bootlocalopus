const isPlain = (ch) => {
  const code = ch.codePointAt(0);
  return code >= 0x20 && code <= 0x7e && ch !== '"' && ch !== '\\' && ch !== '%';
};

function clean(filename) {
  const base = String(filename).split(/[/\\]/).pop();
  // eslint-disable-next-line no-control-regex
  const name = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return name === '' ? 'download' : name;
}

/** RFC 8187 value encoding: only attr-chars survive unencoded. */
const encodeExtended = (name) =>
  encodeURIComponent(name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function contentDisposition(filename, { inline = false } = {}) {
  const type = inline ? 'inline' : 'attachment';
  const name = clean(filename);
  const chars = [...name]; // code points, so an emoji is one character
  if (chars.every(isPlain)) return `${type}; filename="${name}"`;
  const fallback = chars.map((ch) => (isPlain(ch) ? ch : '_')).join('');
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeExtended(name)}`;
}

export function createDownloadHandler(getFile) {
  return (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const match = /^\/download\/([^/]+)$/.exec(pathname);
    const file = req.method === 'GET' && match ? getFile(decodeURIComponent(match[1])) : undefined;
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': file.type,
      'content-disposition': contentDisposition(file.name),
    });
    res.end(file.body);
  };
}
