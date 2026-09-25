import crypto from 'node:crypto';

export class UploadError extends Error {
  constructor(code) {
    super(code);
    this.name = 'UploadError';
    this.code = code;
  }
}

const ascii = (text) => [...Buffer.from(text, 'latin1')];

const FORMATS = [
  { type: 'image/png', exts: ['png'], magic: [{ at: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }] },
  { type: 'image/jpeg', exts: ['jpg', 'jpeg'], magic: [{ at: 0, bytes: [0xff, 0xd8, 0xff] }] },
  { type: 'image/gif', exts: ['gif'], anyOf: [ascii('GIF87a'), ascii('GIF89a')] },
  { type: 'image/webp', exts: ['webp'], magic: [{ at: 0, bytes: ascii('RIFF') }, { at: 8, bytes: ascii('WEBP') }] },
  { type: 'application/pdf', exts: ['pdf'], magic: [{ at: 0, bytes: ascii('%PDF-') }] },
];

const startsWithAt = (data, at, bytes) =>
  data.length >= at + bytes.length && bytes.every((b, i) => data[at + i] === b);

const sniff = (data) =>
  FORMATS.find((f) =>
    f.anyOf
      ? f.anyOf.some((bytes) => startsWithAt(data, 0, bytes))
      : f.magic.every(({ at, bytes }) => startsWithAt(data, at, bytes)),
  );

const displayNameOf = (filename) => {
  const name = typeof filename === 'string' ? filename : '';
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
  return base.replace(/[\x00-\x1f\x7f]/g, '').trim() || 'file';
};

const normaliseType = (value) => (typeof value === 'string' ? value.split(';')[0].trim().toLowerCase() : '');

export function inspectUpload(
  { filename, declaredType, bytes },
  { maxBytes = 5_242_880, allowed = ['image/png', 'image/jpeg', 'image/gif', 'application/pdf'] } = {},
) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new UploadError('empty');
  if (bytes.length > maxBytes) throw new UploadError('too-large');

  // The bytes decide what this is. The client's type and name are claims.
  const format = sniff(bytes);
  if (!format || !allowed.includes(format.type)) throw new UploadError('unsupported-type');

  const declared = normaliseType(declaredType);
  if (declared !== '' && declared !== 'application/octet-stream' && declared !== format.type) {
    throw new UploadError('type-mismatch');
  }

  const displayName = displayNameOf(filename);
  const dot = displayName.lastIndexOf('.');
  const ext = dot === -1 ? '' : displayName.slice(dot + 1).toLowerCase();
  if (!format.exts.includes(ext)) throw new UploadError('extension-mismatch');

  const canonical = format.exts[0];
  return {
    type: format.type,
    ext: canonical,
    size: bytes.length,
    // Never the user's name on disk: a random name with an extension we chose.
    storageName: `${crypto.randomBytes(16).toString('hex')}.${canonical}`,
    displayName,
  };
}
