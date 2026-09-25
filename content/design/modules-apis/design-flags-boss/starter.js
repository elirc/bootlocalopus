import { createHash } from 'node:crypto';

/** Given: a stable bucket 0-99 for this user on this flag. */
export function bucket(flagKey, userId) {
  const digest = createHash('sha256').update(`${flagKey}:${userId}`).digest();
  return digest.readUInt32BE(0) % 100;
}

export class FlagLoadError extends Error {}
export class UnknownFlagError extends Error {}
export class PluginError extends Error {}

const DEPRECATIONS = {
  FLAGS_DEP_001: 'isOn() is deprecated. Use isEnabled().',
  FLAGS_DEP_002: 'The "defaultValues" option is deprecated. Use "defaults".',
};

const defaultWarn = (message, code) => process.emitWarning(message, { type: 'DeprecationWarning', code });

export function createFlagClient(options = {}) {
  return {
    async ready() {
      throw new Error('TODO');
    },
    evaluate(key, user) {
      throw new Error('TODO');
    },
    isEnabled(key, user) {
      throw new Error('TODO');
    },
    isOn(key, user) {
      throw new Error('TODO');
    },
  };
}
