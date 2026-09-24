import { inspect } from 'node:util';

const REDACTED = '[REDACTED]';

export class Secret {
  #value;

  constructor(value) {
    this.#value = String(value);
  }

  reveal() {
    return this.#value;
  }

  toJSON() { return REDACTED; }
  toString() { return REDACTED; }
  [Symbol.toPrimitive]() { return REDACTED; }
  [inspect.custom]() { return REDACTED; }
}

export class ConfigError extends Error {
  constructor(problems) {
    super('invalid config:\n  ' + problems.join('\n  '));
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

/**
 * Each rule turns a raw string into a value or returns { problem }. Rules for
 * secrets never interpolate the raw value into their message.
 */
const oneOf = (name, allowed) => (raw) =>
  allowed.includes(raw) ? { value: raw } : { problem: `${name} must be one of ${allowed.join(', ')} (got "${raw}")` };

const SCHEMA = [
  {
    name: 'PORT', key: 'port', default: 3000,
    parse: (raw) => {
      const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
      return n >= 1 && n <= 65535 ? { value: n } : { problem: `PORT must be an integer from 1 to 65535 (got "${raw}")` };
    },
  },
  { name: 'NODE_ENV', key: 'env', default: 'development', parse: oneOf('NODE_ENV', ['development', 'test', 'production']) },
  { name: 'LOG_LEVEL', key: 'logLevel', default: 'info', parse: oneOf('LOG_LEVEL', ['debug', 'info', 'warn', 'error']) },
  {
    name: 'ENABLE_SIGNUPS', key: 'enableSignups', default: false,
    parse: (raw) => (raw === 'true' || raw === 'false')
      ? { value: raw === 'true' }
      : { problem: `ENABLE_SIGNUPS must be "true" or "false" (got "${raw}")` },
  },
  {
    name: 'DATABASE_URL', key: 'databaseUrl', required: true,
    parse: (raw) => {
      let url;
      try { url = new URL(raw); } catch { return { problem: 'DATABASE_URL is not a valid URL' }; }
      if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
        return { problem: 'DATABASE_URL must be a postgres:// or postgresql:// URL' };
      }
      return { value: new Secret(raw) };
    },
  },
  {
    name: 'SESSION_SECRET', key: 'sessionSecret', required: true,
    parse: (raw) => raw.length >= 32
      ? { value: new Secret(raw) }
      : { problem: 'SESSION_SECRET must be at least 32 characters' },
  },
];

export function loadConfig(env) {
  const config = {};
  const problems = [];

  for (const rule of SCHEMA) {
    const raw = env[rule.name];
    if (raw === undefined || raw === '') {
      if (rule.required) problems.push(`${rule.name} is required`);
      else config[rule.key] = rule.default;
      continue;
    }
    const result = rule.parse(String(raw));
    if ('problem' in result) problems.push(result.problem);
    else config[rule.key] = result.value;
  }

  if (problems.length) throw new ConfigError(problems);
  return Object.freeze(config);
}
