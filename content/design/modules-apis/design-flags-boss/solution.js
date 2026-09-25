import { createHash } from 'node:crypto';

/** Given: a stable bucket 0-99 for this user on this flag. */
export function bucket(flagKey, userId) {
  const digest = createHash('sha256').update(`${flagKey}:${userId}`).digest();
  return digest.readUInt32BE(0) % 100;
}

export class FlagLoadError extends Error {
  constructor(cause) {
    super('Could not load feature flags', { cause });
    this.name = 'FlagLoadError';
  }
}

export class UnknownFlagError extends Error {
  constructor(key) {
    super(`Unknown feature flag "${key}"`);
    this.name = 'UnknownFlagError';
    this.key = key;
  }
}

export class PluginError extends Error {
  constructor(plugin, hook, cause) {
    super(`[${plugin}] ${hook} failed`, { cause });
    this.name = 'PluginError';
    this.plugin = plugin;
    this.hook = hook;
  }
}

const DEPRECATIONS = {
  FLAGS_DEP_001: 'isOn() is deprecated. Use isEnabled().',
  FLAGS_DEP_002: 'The "defaultValues" option is deprecated. Use "defaults".',
};

const KNOWN_OPTIONS = ['fetchFlags', 'defaults', 'defaultValues', 'plugins', 'onError', 'warn'];

const defaultWarn = (message, code) => process.emitWarning(message, { type: 'DeprecationWarning', code });

export function createFlagClient(options = {}) {
  // --- options: fail loudly at construction, never later -------------------
  for (const key of Object.keys(options)) {
    if (!KNOWN_OPTIONS.includes(key)) throw new TypeError(`Unknown option "${key}"`);
  }
  const { fetchFlags, plugins = [], onError = () => {}, warn = defaultWarn } = options;
  if (typeof fetchFlags !== 'function') throw new TypeError('"fetchFlags" must be a function');
  if (options.defaults !== undefined && options.defaultValues !== undefined) {
    throw new TypeError('Use either "defaults" or "defaultValues", not both');
  }

  const warned = new Set();
  const deprecate = (code) => {
    if (warned.has(code)) return;
    warned.add(code);
    warn(DEPRECATIONS[code], code);
  };
  if (options.defaultValues !== undefined) deprecate('FLAGS_DEP_002');
  const defaults = { ...(options.defaults ?? options.defaultValues ?? {}) };

  // --- errors: reported, never thrown from an evaluation --------------------
  const report = (error) => {
    try {
      onError(error);
    } catch {
      // a broken error handler must not break a page render
    }
  };

  // --- state ------------------------------------------------------------------
  let definitions = null; // a private copy once loaded
  let loading = null;
  const reportedUnknown = new Set();

  const fallback = (key) => ({ value: Object.hasOwn(defaults, key) ? defaults[key] : false, reason: 'default' });

  function decide(key, user) {
    for (const plugin of plugins) {
      if (typeof plugin.override !== 'function') continue;
      let forced;
      try {
        forced = plugin.override(key, user);
      } catch (error) {
        report(new PluginError(plugin.name, 'override', error));
        continue;
      }
      if (typeof forced === 'boolean') return { value: forced, reason: 'override' };
    }

    if (definitions === null) return fallback(key);
    if (!Object.hasOwn(definitions, key)) {
      if (!reportedUnknown.has(key)) {
        reportedUnknown.add(key);
        report(new UnknownFlagError(key));
      }
      return fallback(key);
    }

    const flag = definitions[key];
    if (!flag.enabled) return { value: false, reason: 'disabled' };
    const userId = user?.id;
    if (userId !== undefined && flag.allow?.includes(userId)) return { value: true, reason: 'allowlist' };
    const rollout = flag.rollout ?? 100;
    if (rollout >= 100) return { value: true, reason: 'on' };
    if (userId === undefined) return { value: false, reason: 'rollout' };
    return { value: bucket(key, userId) < rollout, reason: 'rollout' };
  }

  const client = {
    ready() {
      if (definitions !== null) return Promise.resolve(true);
      if (loading) return loading;
      loading = (async () => {
        try {
          // A private deep copy: the caller's object can change later; ours cannot.
          definitions = structuredClone(await fetchFlags());
          return true;
        } catch (error) {
          report(new FlagLoadError(error));
          return false; // the app keeps running on defaults
        }
      })().finally(() => {
        loading = null; // a failed load can be retried by the next ready()
      });
      return loading;
    },

    evaluate(key, user) {
      const result = decide(key, user);
      for (const plugin of plugins) {
        if (typeof plugin.onEvaluate !== 'function') continue;
        try {
          plugin.onEvaluate({ key, userId: user?.id, ...result });
        } catch (error) {
          report(new PluginError(plugin.name, 'onEvaluate', error));
        }
      }
      return result;
    },

    isEnabled(key, user) {
      return client.evaluate(key, user).value;
    },

    isOn(key, user) {
      deprecate('FLAGS_DEP_001');
      return client.isEnabled(key, user);
    },
  };
  return client;
}
