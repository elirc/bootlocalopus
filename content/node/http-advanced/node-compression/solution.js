import { promisify } from 'node:util';
import { gzip, brotliCompress } from 'node:zlib';

const compressors = { gzip: promisify(gzip), br: promisify(brotliCompress) };
const MIN_BYTES = 1024;

export function pickEncoding(header) {
  if (typeof header !== 'string' || header.trim() === '') return 'identity';
  const q = new Map();
  for (const part of header.split(',')) {
    const [coding, ...params] = part.split(';').map((s) => s.trim());
    if (!coding) continue;
    let quality = 1;
    for (const param of params) {
      const [key, value = ''] = param.split('=').map((s) => s.trim());
      if (key.toLowerCase() === 'q') quality = Number(value);
    }
    if (Number.isFinite(quality)) q.set(coding.toLowerCase(), quality);
  }
  const quality = (coding) => q.get(coding) ?? q.get('*') ?? 0;
  const br = quality('br');
  const gz = quality('gzip');
  if (br <= 0 && gz <= 0) return 'identity';
  return br >= gz ? 'br' : 'gzip';
}

function isCompressible(type) {
  const base = type.split(';')[0].trim().toLowerCase();
  if (base === 'image/svg+xml') return true;
  if (base.startsWith('image/') || base.startsWith('video/') || base.startsWith('audio/')) return false;
  return base !== 'application/zip' && base !== 'application/gzip';
}

function addVary(res, field) {
  const current = res.getHeader('vary');
  if (current === undefined || current === '') {
    res.setHeader('vary', field);
    return;
  }
  const text = Array.isArray(current) ? current.join(', ') : String(current);
  const listed = text.split(',').map((s) => s.trim().toLowerCase());
  if (!listed.includes(field.toLowerCase()) && !listed.includes('*')) res.setHeader('vary', `${text}, ${field}`);
}

export async function sendCompressed(req, res, { status = 200, type, body }) {
  let data = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.setHeader('content-type', type);
  addVary(res, 'Accept-Encoding'); // even when we do not compress: the answer depends on the header

  const encoding = pickEncoding(req.headers['accept-encoding']);
  if (encoding !== 'identity' && data.length >= MIN_BYTES && isCompressible(type)) {
    data = await compressors[encoding](data);
    res.setHeader('content-encoding', encoding);
  }
  res.setHeader('content-length', data.length);
  res.writeHead(status);
  res.end(data);
}
