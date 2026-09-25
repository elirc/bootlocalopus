import crypto from 'node:crypto';

export class UploadError extends Error {
  constructor(code) {
    super(code);
    this.name = 'UploadError';
    this.code = code;
  }
}

export function inspectUpload(
  { filename, declaredType, bytes },
  { maxBytes = 5_242_880, allowed = ['image/png', 'image/jpeg', 'image/gif', 'application/pdf'] } = {},
) {
  // Trusts the client completely. Replace with the checks from the brief.
  if (!allowed.includes(declaredType)) throw new UploadError('unsupported-type');
  return { type: declaredType, ext: filename.split('.').pop(), size: bytes.length, storageName: filename, displayName: filename };
}
