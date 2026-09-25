import crypto from 'node:crypto';

export class RefreshError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RefreshError';
    this.code = code;
  }
}

const newToken = () => crypto.randomBytes(32).toString('base64url');
// Store a hash, never the token: a leaked table cannot be replayed.
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function createTokenService({
  accessTtlMs = 900_000,
  refreshTtlMs = 1_209_600_000,
  familyTtlMs = 2_592_000_000,
  now = Date.now,
} = {}) {
  const families = new Map(); // familyId -> { userId, createdAt, revoked }
  const refreshTokens = new Map(); // hash -> { familyId, issuedAt, used }
  const accessTokens = new Map(); // hash -> { familyId, issuedAt }

  const lookup = (map, token) => (typeof token === 'string' ? map.get(hash(token)) : undefined);

  const issuePair = (familyId) => {
    const accessToken = newToken();
    const refreshToken = newToken();
    const t = now();
    accessTokens.set(hash(accessToken), { familyId, issuedAt: t });
    refreshTokens.set(hash(refreshToken), { familyId, issuedAt: t, used: false });
    return { accessToken, refreshToken };
  };

  // Revocation is a flag on the family, so every token that points at it dies
  // at once without hunting them down. (A real store would also purge them.)
  const revoke = (familyId) => {
    families.get(familyId).revoked = true;
  };

  return {
    login(userId) {
      const familyId = crypto.randomUUID();
      families.set(familyId, { userId, createdAt: now(), revoked: false });
      return issuePair(familyId);
    },

    refresh(refreshToken) {
      const record = lookup(refreshTokens, refreshToken);
      if (!record) throw new RefreshError('invalid');
      const family = families.get(record.familyId);
      if (family.revoked) throw new RefreshError('invalid');

      if (record.used) {
        // Someone holds a copy. We cannot tell who, so nobody keeps the session.
        revoke(record.familyId);
        throw new RefreshError('reuse-detected');
      }

      const t = now();
      if (t >= record.issuedAt + refreshTtlMs || t >= family.createdAt + familyTtlMs) {
        throw new RefreshError('expired');
      }

      record.used = true;
      return issuePair(record.familyId);
    },

    authenticate(accessToken) {
      const record = lookup(accessTokens, accessToken);
      if (!record) return null;
      const family = families.get(record.familyId);
      if (family.revoked || now() >= record.issuedAt + accessTtlMs) return null;
      return { userId: family.userId };
    },

    logout(refreshToken) {
      const record = lookup(refreshTokens, refreshToken);
      if (!record || families.get(record.familyId).revoked) return false;
      revoke(record.familyId);
      return true;
    },

    revokeAllForUser(userId) {
      let count = 0;
      for (const family of families.values()) {
        if (family.userId === userId && !family.revoked) {
          family.revoked = true;
          count++;
        }
      }
      return count;
    },
  };
}
