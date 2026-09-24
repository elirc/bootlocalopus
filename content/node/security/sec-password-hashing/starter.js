import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export const DEFAULT_PARAMS = Object.freeze({ N: 16384, r: 8, p: 1 });

export async function hash(password, params = DEFAULT_PARAMS) {
  // TODO: 16 random salt bytes, a 32-byte scrypt key, and
  // `scrypt$<N>$<r>$<p>$<salt>$<key>` with base64url for the binary parts.
  throw new Error('hash() is not implemented yet');
}

export async function verify(password, stored) {
  // TODO: parse `stored`, re-derive with ITS salt and params, compare with
  // crypto.timingSafeEqual. Anything malformed resolves false; never throw.
  throw new Error('verify() is not implemented yet');
}

export function needsRehash(stored, params = DEFAULT_PARAMS) {
  // TODO
  throw new Error('needsRehash() is not implemented yet');
}
