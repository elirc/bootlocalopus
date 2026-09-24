import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export const DEFAULT_PARAMS = Object.freeze({ N: 16384, r: 8, p: 1 });

const SALT_BYTES = 16;
const KEY_BYTES = 32;
const INT = /^[1-9]\d{0,9}$/;

/** Parse a stored hash into its parts, or null if it is not one of ours. */
function parse(stored) {
  if (typeof stored !== 'string') return null;
  const fields = stored.split('$');
  if (fields.length !== 6 || fields[0] !== 'scrypt') return null;
  const [, n, r, p, salt, key] = fields;
  if (![n, r, p].every((v) => INT.test(v))) return null;
  const saltBytes = Buffer.from(salt, 'base64url');
  const keyBytes = Buffer.from(key, 'base64url');
  if (saltBytes.length < SALT_BYTES || keyBytes.length !== KEY_BYTES) return null;
  return { params: { N: Number(n), r: Number(r), p: Number(p) }, salt: saltBytes, key: keyBytes };
}

export async function hash(password, params = DEFAULT_PARAMS) {
  const { N, r, p } = params;
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_BYTES, { N, r, p });
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verify(password, stored) {
  if (typeof password !== 'string') return false;
  const parsed = parse(stored);
  if (!parsed) return false;
  try {
    const actual = await scrypt(password, parsed.salt, KEY_BYTES, parsed.params);
    // Both are exactly KEY_BYTES long, so timingSafeEqual cannot throw on length.
    return crypto.timingSafeEqual(actual, parsed.key);
  } catch {
    // Parameters scrypt refuses (N not a power of two, over the memory limit).
    return false;
  }
}

export function needsRehash(stored, params = DEFAULT_PARAMS) {
  const parsed = parse(stored);
  if (!parsed) return true;
  const { N, r, p } = parsed.params;
  return N !== params.N || r !== params.r || p !== params.p;
}
