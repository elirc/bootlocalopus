`process.env` is `Record<string, string | undefined>`, and the usual code
reading it is a row of casts and coercions that all compile:

```ts
port: Number(process.env.PORT ?? 3000),          // PORT= gives 0; PORT=80abc gives NaN
enableMetrics: Boolean(process.env.ENABLE_METRICS), // 'false' is true
databaseUrl: process.env.DATABASE_URL!,             // undefined, discovered on first query
logLevel: process.env.LOG_LEVEL as LogLevel,        // 'INFO' sails through
```

Each one fails **later**, far from the cause: at the first query, at the first
log line, or never, with metrics silently on. The fix is to parse the
environment **once, at startup**, into a typed and frozen config. If anything
is wrong, fail right there with **every** problem listed, so a broken deploy
is fixed in one go and not one restart per variable.

This lesson has **runtime** tests.

## Task

Export `parseEnv(env)` and `class EnvError extends Error`. Unknown variables
are ignored. **An empty string means unset** (`PORT=` in a `.env` file).
Values are not trimmed (except feature flags).

| variable | field | rule | default |
| --- | --- | --- | --- |
| `NODE_ENV` | `nodeEnv` | one of `development`, `test`, `production` | `'development'` |
| `PORT` | `port` | digits only, 1–65535 | `3000` |
| `DATABASE_URL` | `databaseUrl` | **required**; parses with `new URL` and the protocol is `postgres:` or `postgresql:` | — |
| `LOG_LEVEL` | `logLevel` | one of `debug`, `info`, `warn`, `error` (case-sensitive) | `'info'` |
| `REQUEST_TIMEOUT_MS` | `requestTimeoutMs` | digits only, ≥ 1 | `5000` |
| `ENABLE_METRICS` | `enableMetrics` | `true`/`1` → `true`, `false`/`0` → `false`, anything else is an error | `false` |
| `FEATURE_FLAGS` | `featureFlags` | comma-separated, each trimmed, empty entries dropped | `[]` |

"Digits only" means `/^\d+$/`: `'80abc'`, `'80.5'`, `'1e3'`, `' 8080'`, `'-1'`
and `'0x50'` are all errors.

The error strings, exactly, in **table order**:

- `NODE_ENV must be one of development, test, production`
- `PORT must be an integer between 1 and 65535`
- `DATABASE_URL is required` / `DATABASE_URL must be a postgres:// URL`
- `LOG_LEVEL must be one of debug, info, warn, error`
- `REQUEST_TIMEOUT_MS must be a positive integer`
- `ENABLE_METRICS must be true, false, 1 or 0`

If there are any, throw an `EnvError` with `name` `'EnvError'`, `errors` (the
array of strings) and `message` `'Invalid environment:'` followed by one
`'\n- ' + error` line per error. **Never include a value** in a message: it may
be a password. Otherwise return the config, frozen with `Object.freeze`, with
exactly the seven fields in the table.
