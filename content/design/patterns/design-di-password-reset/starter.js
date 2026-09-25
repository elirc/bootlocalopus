// Works, but hard-wired: the clock, the token source and the mailer cannot
// be replaced, so none of the interesting rules can be tested quickly.
// Refactor it to take them from `deps`, and add the missing rules from the brief.
import { randomUUID } from 'node:crypto';

export const RESET_TTL_MS = 30 * 60 * 1000;
export class InvalidTokenError extends Error {}
export class WeakPasswordError extends Error {}

async function sendEmail(message) {
  console.log('sending email', message.to);
}

export function createPasswordResetService(deps) {
  const tokens = new Map();

  return {
    async requestReset(email) {
      const user = await deps.users.findByEmail(email);
      if (!user) throw new Error('No account with that email');
      const token = randomUUID();
      tokens.set(token, { userId: user.id, expiresAt: Date.now() + RESET_TTL_MS });
      await sendEmail({ to: user.email, subject: 'Reset your password', text: `Reset: https://app.example/reset?token=${token}` });
    },

    async resetPassword(token, newPassword) {
      const record = tokens.get(token);
      if (!record || Date.now() > record.expiresAt) throw new InvalidTokenError('Invalid token');
      await deps.users.updatePassword(record.userId, await deps.hashPassword(newPassword));
    },
  };
}
