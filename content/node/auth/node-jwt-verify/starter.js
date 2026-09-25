import crypto from 'node:crypto';

export class JwtError extends Error {
  constructor(code) {
    super(code);
    this.name = 'JwtError';
    this.code = code;
  }
}

export function verifyJwt(token, { secret, issuer, audience, leewaySec = 0, now = Date.now }) {
  // This is what "it works" looks like before anyone attacks it: it decodes
  // the payload and trusts it. Nothing is verified.
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}
