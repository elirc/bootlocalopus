import crypto from 'node:crypto';

export function createTokens({ secret, ttlMs = 3600_000, now = Date.now }) {
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

  const signature = (data) => {
    // TODO: HMAC-SHA256, base64url
  };

  return {
    sign(payload) {
      // TODO
    },
    verify(token) {
      // TODO
    },
  };
}
