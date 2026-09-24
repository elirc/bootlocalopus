import crypto from 'node:crypto';

export function createTokens({ secret, ttlMs = 3600_000, now = Date.now }) {
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

  const signature = (data) =>
    crypto.createHmac('sha256', secret).update(data).digest('base64url');

  const sameSignature = (a, b) => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    // timingSafeEqual throws on a length mismatch, so screen that out first.
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
  };

  return {
    sign(payload) {
      const body = encode({ ...payload, exp: now() + ttlMs });
      return body + '.' + signature(body);
    },

    verify(token) {
      if (typeof token !== 'string') throw new Error('invalid token');
      const parts = token.split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('invalid token');

      const [body, provided] = parts;

      // Authenticate before parsing: never act on an unverified payload.
      if (!sameSignature(provided, signature(body))) throw new Error('bad signature');

      let payload;
      try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      } catch {
        throw new Error('invalid token');
      }
      if (typeof payload !== 'object' || payload === null) throw new Error('invalid token');
      if (typeof payload.exp !== 'number') throw new Error('invalid token');
      if (payload.exp <= now()) throw new Error('token expired');

      return payload;
    },
  };
}
