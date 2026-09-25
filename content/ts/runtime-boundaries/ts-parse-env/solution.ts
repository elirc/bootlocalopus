const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
const NODE_ENVS = ['development', 'test', 'production'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type NodeEnv = (typeof NODE_ENVS)[number];

export interface Config {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
  logLevel: LogLevel;
  requestTimeoutMs: number;
  enableMetrics: boolean;
  featureFlags: string[];
}

export class EnvError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`Invalid environment:\n${errors.map((e) => `- ${e}`).join('\n')}`);
    this.name = 'EnvError';
    this.errors = errors;
  }
}

type Env = Record<string, string | undefined>;

export function parseEnv(env: Env): Readonly<Config> {
  const errors: string[] = [];
  // `PORT=` in a .env file gives an empty string, which means "not set".
  const read = (key: string): string | undefined => (env[key] === '' ? undefined : env[key]);

  function oneOf<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    const raw = read(key);
    if (raw === undefined) return fallback;
    if ((allowed as readonly string[]).includes(raw)) return raw as T;
    errors.push(`${key} must be one of ${allowed.join(', ')}`);
    return fallback;
  }

  function integer(key: string, fallback: number, min: number, max: number, rule: string): number {
    const raw = read(key);
    if (raw === undefined) return fallback;
    // Number('') is 0, Number('1e3') is 1000 and parseInt('80abc') is 80: only digits are an integer here.
    const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (Number.isSafeInteger(n) && n >= min && n <= max) return n;
    errors.push(`${key} must be ${rule}`);
    return fallback;
  }

  function flag(key: string): boolean {
    const raw = read(key);
    if (raw === undefined || raw === 'false' || raw === '0') return false;
    if (raw === 'true' || raw === '1') return true;
    // Boolean('false') is true: never coerce a string to a boolean.
    errors.push(`${key} must be true, false, 1 or 0`);
    return false;
  }

  function postgresUrl(key: string): string {
    const raw = read(key);
    if (raw === undefined) {
      errors.push(`${key} is required`);
      return '';
    }
    let protocol = '';
    try {
      protocol = new URL(raw).protocol;
    } catch {
      // not a URL at all
    }
    if (protocol !== 'postgres:' && protocol !== 'postgresql:') errors.push(`${key} must be a postgres:// URL`);
    return raw;
  }

  function list(key: string): string[] {
    return (read(key) ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '');
  }

  const config: Config = {
    nodeEnv: oneOf('NODE_ENV', NODE_ENVS, 'development'),
    port: integer('PORT', 3000, 1, 65535, 'an integer between 1 and 65535'),
    databaseUrl: postgresUrl('DATABASE_URL'),
    logLevel: oneOf('LOG_LEVEL', LOG_LEVELS, 'info'),
    requestTimeoutMs: integer('REQUEST_TIMEOUT_MS', 5000, 1, Number.MAX_SAFE_INTEGER, 'a positive integer'),
    enableMetrics: flag('ENABLE_METRICS'),
    featureFlags: list('FEATURE_FLAGS'),
  };

  // Report every problem at once: fixing a deploy one variable per restart is miserable.
  if (errors.length > 0) throw new EnvError(errors);
  return Object.freeze(config);
}
