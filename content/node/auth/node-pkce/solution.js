import crypto from 'node:crypto';

export class OAuthError extends Error {
  constructor(error) {
    super(error);
    this.name = 'OAuthError';
    this.error = error;
  }
}

const random = () => crypto.randomBytes(32).toString('base64url');
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

export function createVerifier() {
  return random();
}

export function challengeFor(verifier) {
  return crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

const sameText = (a, b) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

export function createAuthServer({ clients, codeTtlMs = 60_000, now = Date.now }) {
  const codes = new Map(); // code -> { clientId, redirectUri, codeChallenge, userId, issuedAt }
  // code -> the access token it produced, or null. In production this lives in
  // a store with a TTL (a day is plenty); a Map keeps the lesson small.
  const spent = new Map();
  const tokens = new Map(); // accessToken -> { userId, clientId }

  const fail = (error) => {
    throw new OAuthError(error);
  };

  return {
    authorize({ clientId, redirectUri, codeChallenge, codeChallengeMethod, userId }) {
      if (typeof clientId !== 'string' || !Object.hasOwn(clients, clientId)) fail('invalid_client');
      // Exact match only: prefix or "same host" matching is how codes get redirected to attackers.
      if (!clients[clientId].redirectUris.includes(redirectUri)) fail('invalid_request');
      if (codeChallengeMethod !== 'S256') fail('invalid_request');
      if (typeof codeChallenge !== 'string' || !CHALLENGE.test(codeChallenge)) fail('invalid_request');

      const code = random();
      codes.set(code, { clientId, redirectUri, codeChallenge, userId, issuedAt: now() });
      return code;
    },

    exchange({ code, clientId, redirectUri, codeVerifier }) {
      if (typeof codeVerifier !== 'string' || !VERIFIER.test(codeVerifier)) fail('invalid_request');

      if (spent.has(code)) {
        // Replay: one of the two callers is an attacker, so neither keeps a token.
        const issued = spent.get(code);
        if (issued) tokens.delete(issued);
        fail('invalid_grant');
      }

      const grant = codes.get(code);
      if (!grant) fail('invalid_grant');
      if (now() >= grant.issuedAt + codeTtlMs) {
        codes.delete(code);
        fail('invalid_grant');
      }

      // One attempt per code, successful or not: no unlimited verifier guessing.
      codes.delete(code);
      spent.set(code, null);

      if (grant.clientId !== clientId || grant.redirectUri !== redirectUri) fail('invalid_grant');
      if (!sameText(challengeFor(codeVerifier), grant.codeChallenge)) fail('invalid_grant');

      const accessToken = random();
      tokens.set(accessToken, { userId: grant.userId, clientId: grant.clientId });
      spent.set(code, accessToken);
      return { accessToken, userId: grant.userId };
    },

    introspect(accessToken) {
      const t = typeof accessToken === 'string' ? tokens.get(accessToken) : undefined;
      return t ? { active: true, userId: t.userId, clientId: t.clientId } : { active: false };
    },
  };
}
