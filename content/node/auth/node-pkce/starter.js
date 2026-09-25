import crypto from 'node:crypto';

export class OAuthError extends Error {
  constructor(error) {
    super(error);
    this.name = 'OAuthError';
    this.error = error;
  }
}

export function createVerifier() {
  throw new Error('not implemented');
}

export function challengeFor(verifier) {
  throw new Error('not implemented');
}

export function createAuthServer({ clients, codeTtlMs = 60_000, now = Date.now }) {
  const codes = new Map();
  const tokens = new Map();

  return {
    authorize({ clientId, redirectUri, codeChallenge, codeChallengeMethod, userId }) {
      throw new OAuthError('server_error');
    },

    exchange({ code, clientId, redirectUri, codeVerifier }) {
      throw new OAuthError('server_error');
    },

    introspect(accessToken) {
      return { active: false };
    },
  };
}
