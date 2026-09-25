import crypto from 'node:crypto';

export class JwtError extends Error {
  constructor(code) {
    super(code);
    this.name = 'JwtError';
    this.code = code;
  }
}

const SEGMENT = /^[A-Za-z0-9_-]+$/;

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parse a base64url JSON segment; anything but a plain object is `undefined`. */
const decodeObject = (segment) => {
  try {
    const value = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const sameText = (a, b) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

export function verifyJwt(token, { secret, issuer, audience, leewaySec = 0, now = Date.now }) {
  const fail = (code) => {
    throw new JwtError(code);
  };

  if (typeof token !== 'string') fail('malformed');
  const parts = token.split('.');
  if (parts.length !== 3 || !parts.every((p) => SEGMENT.test(p))) fail('malformed');
  const [head, body, signature] = parts;

  const header = decodeObject(head);
  if (!header) fail('malformed');
  // The server chooses the algorithm. The header only has to agree with it.
  if (header.alg !== 'HS256') fail('unsupported-alg');

  const expected = crypto.createHmac('sha256', secret).update(head + '.' + body).digest('base64url');
  if (!sameText(signature, expected)) fail('bad-signature');

  // Only now is the payload trustworthy enough to read.
  const payload = decodeObject(body);
  if (!payload) fail('malformed');
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) fail('malformed');
  if (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || !Number.isFinite(payload.nbf))) fail('malformed');

  const nowSec = now() / 1000; // JWT times are seconds, Date.now() is milliseconds
  if (nowSec >= payload.exp + leewaySec) fail('expired');
  if (payload.nbf !== undefined && nowSec < payload.nbf - leewaySec) fail('not-yet-valid');

  if (issuer !== undefined && payload.iss !== issuer) fail('bad-issuer');

  if (audience !== undefined) {
    const { aud } = payload;
    const ok = aud === audience || (Array.isArray(aud) && aud.some((a) => a === audience));
    if (!ok) fail('bad-audience');
  }

  return payload;
}
