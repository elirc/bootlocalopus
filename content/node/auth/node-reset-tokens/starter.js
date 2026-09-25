import crypto from 'node:crypto';

export class ResetError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ResetError';
    this.code = code;
  }
}

export function createResetService({ users, mailer, tokens = new Map(), ttlMs = 1_800_000, now = Date.now, onPasswordChanged = () => {} }) {
  return {
    async requestReset(email) {
      const user = await users.findByEmail(email);
      if (!user) throw new Error('no account with that email'); // enumeration!
      const token = crypto.randomBytes(32).toString('base64url');
      tokens.set(token, { userId: user.id, expiresAt: now() + ttlMs }); // raw token at rest!
      await mailer.send(user.email, token);
      return { ok: true };
    },

    async resetPassword(token, newPassword) {
      // TODO: hash lookup, expiry, single use, password rule, revoke sessions.
      throw new ResetError('not implemented');
    },
  };
}
