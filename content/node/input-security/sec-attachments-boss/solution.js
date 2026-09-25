import http from 'node:http';
import crypto from 'node:crypto';

// ---- helpers -------------------------------------------------------------

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const CONTROL = /[\x00-\x1f\x7f]/g;

/** Last path segment, no control characters, trimmed; `fallback` if nothing is left. */
const cleanName = (name, fallback) => {
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
  return (base.replace(CONTROL, '').trim() || fallback).toWellFormed();
};

// ---- sniffing ------------------------------------------------------------

const FORMATS = [
  { type: 'image/png', exts: ['png'], magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', exts: ['jpg', 'jpeg'], magic: [0xff, 0xd8, 0xff] },
  { type: 'application/pdf', exts: ['pdf'], magic: [...Buffer.from('%PDF-', 'latin1')] },
];

const sniff = (bytes) => FORMATS.find((f) => bytes.length >= f.magic.length && f.magic.every((b, i) => bytes[i] === b));

const inspect = ({ filename, declaredType, bytes }) => {
  if (bytes.length === 0) throw new HttpError(400, 'empty');
  const format = sniff(bytes);
  if (!format) throw new HttpError(415, 'unsupported-type');
  const declared = (declaredType ?? '').split(';')[0].trim().toLowerCase();
  if (declared !== '' && declared !== 'application/octet-stream' && declared !== format.type) {
    throw new HttpError(415, 'type-mismatch');
  }
  const name = cleanName(filename, 'file');
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
  if (!format.exts.includes(ext)) throw new HttpError(415, 'extension-mismatch');
  return { type: format.type, name };
};

// ---- Content-Disposition (RFC 6266 / 5987) -------------------------------

const contentDisposition = (name) => {
  const cleaned = cleanName(name, 'download');
  let fallback = '';
  for (const ch of cleaned) {
    const code = ch.codePointAt(0);
    fallback += code >= 0x20 && code <= 0x7e && ch !== '"' && ch !== '\\' && ch !== '%' ? ch : '_';
  }
  let header = `attachment; filename="${fallback}"`;
  if (fallback !== cleaned) {
    const encoded = encodeURIComponent(cleaned).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
    header += `; filename*=UTF-8''${encoded}`;
  }
  return header;
};

// ---- the app -------------------------------------------------------------

export function createAttachmentsApp({ authenticate, maxBytes = 5_242_880, quotaBytes = 20_971_520, maxInFlight = 2 }) {
  const files = new Map(); // id -> { id, ownerId, name, type, size, bytes }
  const accounts = new Map(); // userId -> { stored, reserved, inFlight }

  const accountOf = (userId) => {
    let a = accounts.get(userId);
    if (!a) accounts.set(userId, (a = { stored: 0, reserved: 0, inFlight: 0 }));
    return a;
  };

  const summary = (f) => ({ id: f.id, name: f.name, type: f.type, size: f.size });

  const readBody = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks);
  };

  const upload = async (req, res, userId) => {
    const lengthHeader = req.headers['content-length'];
    if (lengthHeader === undefined) throw new HttpError(411, 'length-required');
    const length = Number(lengthHeader);
    // Refuse before reading a single byte of the body.
    if (length > maxBytes) throw new HttpError(413, 'too-large');

    let filename = '';
    try {
      filename = decodeURIComponent(req.headers['x-filename'] ?? '');
    } catch {
      throw new HttpError(400, 'bad-request');
    }

    const account = accountOf(userId);
    if (account.inFlight >= maxInFlight) throw new HttpError(429, 'too-many-in-flight');
    // In-flight uploads have been promised room: count them.
    if (account.stored + account.reserved + length > quotaBytes) throw new HttpError(413, 'quota-exceeded');

    account.inFlight++;
    account.reserved += length;
    try {
      const bytes = await readBody(req);
      const { type, name } = inspect({ filename, declaredType: req.headers['content-type'], bytes });
      const id = crypto.randomBytes(16).toString('base64url');
      files.set(id, { id, ownerId: userId, name, type, size: bytes.length, bytes });
      account.stored += bytes.length;
      sendJson(res, 201, summary(files.get(id)));
    } finally {
      // Exactly once, on every path: success, rejection or an aborted upload.
      account.inFlight--;
      account.reserved -= length;
    }
  };

  /** The caller's own file, or 404: someone else's file does not exist for them. */
  const ownFile = (id, userId) => {
    const file = files.get(id);
    if (!file || file.ownerId !== userId) throw new HttpError(404, 'not-found');
    return file;
  };

  const download = (res, file) => {
    res.writeHead(200, {
      'content-type': file.type,
      'content-length': file.size,
      'content-disposition': contentDisposition(file.name),
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    });
    res.end(file.bytes);
  };

  const route = async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const one = /^\/attachments\/([A-Za-z0-9_-]+)$/.exec(pathname);
    if (pathname !== '/attachments' && !one) throw new HttpError(404, 'not-found');

    const userId = await authenticate(req);
    if (userId === null || userId === undefined) throw new HttpError(401, 'unauthorized');

    if (pathname === '/attachments' && req.method === 'POST') return upload(req, res, userId);
    if (pathname === '/attachments' && req.method === 'GET') {
      return sendJson(res, 200, [...files.values()].filter((f) => f.ownerId === userId).map(summary));
    }
    if (one && req.method === 'GET') return download(res, ownFile(one[1], userId));
    if (one && req.method === 'DELETE') {
      const file = ownFile(one[1], userId);
      files.delete(file.id);
      accountOf(userId).stored -= file.size;
      res.writeHead(204);
      return res.end();
    }
    throw new HttpError(404, 'not-found');
  };

  const server = http.createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (error instanceof HttpError) return sendJson(res, error.status, { error: error.code });
      sendJson(res, 500, { error: 'internal' });
    }
  });

  return { server };
}
