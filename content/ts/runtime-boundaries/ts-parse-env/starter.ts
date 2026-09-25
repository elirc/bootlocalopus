export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type NodeEnv = 'development' | 'test' | 'production';

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
    super('TODO');
    this.errors = errors;
  }
}

// This is the version most codebases start with. Every line of it is a trap.
export function parseEnv(env: Record<string, string | undefined>): Readonly<Config> {
  return {
    nodeEnv: (env.NODE_ENV ?? 'development') as NodeEnv,
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL!,
    logLevel: (env.LOG_LEVEL ?? 'info') as LogLevel,
    requestTimeoutMs: parseInt(env.REQUEST_TIMEOUT_MS ?? '5000'),
    enableMetrics: Boolean(env.ENABLE_METRICS),
    featureFlags: (env.FEATURE_FLAGS ?? '').split(','),
  };
}
