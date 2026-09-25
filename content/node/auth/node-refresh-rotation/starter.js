import crypto from 'node:crypto';

export class RefreshError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RefreshError';
    this.code = code;
  }
}

export function createTokenService({
  accessTtlMs = 900_000,
  refreshTtlMs = 1_209_600_000,
  familyTtlMs = 2_592_000_000,
  now = Date.now,
} = {}) {
  // The version that ships first: a refresh token that works forever, as
  // many times as anyone likes.
  const refreshTokens = new Map(); // token -> userId
  const accessTokens = new Map(); // token -> userId

  const issue = (userId) => {
    const accessToken = crypto.randomBytes(32).toString('base64url');
    const refreshToken = crypto.randomBytes(32).toString('base64url');
    accessTokens.set(accessToken, userId);
    refreshTokens.set(refreshToken, userId);
    return { accessToken, refreshToken };
  };

  return {
    login(userId) {
      return issue(userId);
    },

    refresh(refreshToken) {
      // TODO: families, single use, reuse detection, expiry.
      const userId = refreshTokens.get(refreshToken);
      if (userId === undefined) throw new RefreshError('invalid');
      return issue(userId);
    },

    authenticate(accessToken) {
      const userId = accessTokens.get(accessToken);
      return userId === undefined ? null : { userId };
    },

    logout(refreshToken) {
      throw new Error('not implemented');
    },

    revokeAllForUser(userId) {
      throw new Error('not implemented');
    },
  };
}
