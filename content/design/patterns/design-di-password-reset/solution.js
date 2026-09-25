import { randomBytes } from 'node:crypto';

export const RESET_TTL_MS = 30 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 12;

export class InvalidTokenError extends Error {
  constructor(message = 'This reset link is invalid or has expired') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

export class WeakPasswordError extends Error {
  constructor(message = `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters`) {
    super(message);
    this.name = 'WeakPasswordError';
  }
}

const defaultToken = () => randomBytes(32).toString('base64url');

export function createPasswordResetService({
  users,
  mailer,
  hashPassword,
  clock = Date.now,
  generateToken = defaultToken,
}) {
  const tokens = new Map(); // token -> { userId, expiresAt }

  return {
    async requestReset(email) {
      const user = await users.findByEmail(String(email).trim().toLowerCase());
      if (!user) return; // same outcome as success: no account enumeration

      for (const [token, record] of tokens) {
        if (record.userId === user.id) tokens.delete(token);
      }
      const token = generateToken();
      tokens.set(token, { userId: user.id, expiresAt: clock() + RESET_TTL_MS });

      await mailer.send({
        to: user.email,
        subject: 'Reset your password',
        text: `Someone asked to reset your password. If it was you, open https://app.example/reset?token=${token} within 30 minutes.`,
      });
    },

    async resetPassword(token, newPassword) {
      const record = tokens.get(token);
      if (!record || clock() >= record.expiresAt) throw new InvalidTokenError();
      if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) throw new WeakPasswordError();

      await users.updatePassword(record.userId, await hashPassword(newPassword));
      tokens.delete(token);
    },
  };
}
