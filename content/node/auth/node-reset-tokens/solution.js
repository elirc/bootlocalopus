import crypto from 'node:crypto';

export class ResetError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ResetError';
    this.code = code;
  }
}

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function createResetService({ users, mailer, tokens = new Map(), ttlMs = 1_800_000, now = Date.now, onPasswordChanged = () => {} }) {
  const forgetUser = (userId) => {
    for (const [key, record] of tokens) if (record.userId === userId) tokens.delete(key);
  };

  return {
    async requestReset(email) {
      const normalised = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const user = normalised ? await users.findByEmail(normalised) : undefined;
      // Same answer either way: the response must not reveal who has an account.
      if (!user) return { ok: true };

      forgetUser(user.id);
      const token = crypto.randomBytes(32).toString('base64url');
      tokens.set(hash(token), { userId: user.id, expiresAt: now() + ttlMs });
      await mailer.send(user.email, token);
      return { ok: true };
    },

    async resetPassword(token, newPassword) {
      if (typeof token !== 'string' || token === '') throw new ResetError('invalid-token');
      const key = hash(token);
      const record = tokens.get(key);
      if (!record) throw new ResetError('invalid-token');
      if (now() >= record.expiresAt) {
        tokens.delete(key);
        throw new ResetError('invalid-token');
      }
      if (typeof newPassword !== 'string' || newPassword.length < 12) throw new ResetError('weak-password');

      // Consume synchronously, before any await: a concurrent call with the
      // same token now finds nothing.
      forgetUser(record.userId);

      await users.setPassword(record.userId, newPassword);
      await onPasswordChanged(record.userId);
      return { ok: true };
    },
  };
}
