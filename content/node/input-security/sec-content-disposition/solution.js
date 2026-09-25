import http from 'node:http';

const CONTROL = /[\x00-\x1f\x7f]/g;

const clean = (name) => {
  if (typeof name !== 'string') return 'download';
  // A download name is a name, not a path: keep the last segment only.
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
  // toWellFormed: a lone surrogate would make encodeURIComponent throw.
  return (base.replace(CONTROL, '').trim() || 'download').toWellFormed();
};

const asciiFallback = (name) => {
  let out = '';
  for (const ch of name) {
    const code = ch.codePointAt(0);
    const printable = code >= 0x20 && code <= 0x7e;
    out += printable && ch !== '"' && ch !== '\\' && ch !== '%' ? ch : '_';
  }
  return out;
};

// RFC 5987 attr-char: encodeURIComponent leaves ' ( ) * alone, which it must not.
const encodeRfc5987 = (value) =>
  encodeURIComponent(value).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function contentDisposition(name, { inline = false } = {}) {
  const cleaned = clean(name);
  const fallback = asciiFallback(cleaned);
  let header = `${inline ? 'inline' : 'attachment'}; filename="${fallback}"`;
  if (fallback !== cleaned) header += `; filename*=UTF-8''${encodeRfc5987(cleaned)}`;
  return header;
}

export function createDownloadServer(files) {
  return http.createServer((req, res) => {
    const match = req.method === 'GET' && /^\/download\/([^/?]+)(?:\?.*)?$/.exec(req.url);
    const file = match ? files.get(match[1]) : undefined;
    if (!file) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'content-type': file.type,
      'content-disposition': contentDisposition(file.name),
      'x-content-type-options': 'nosniff',
    });
    res.end(file.body);
  });
}
