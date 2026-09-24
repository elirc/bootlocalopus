Two config bugs every team ships once:

- **Validated lazily.** `process.env.PORT` is read deep in the code, so a typo
  in the deploy crashes the service on the first request instead of at boot,
  and fixing it takes one deploy *per* missing variable because the error only
  ever names the first.
- **Secrets in logs.** `logger.info('booting', config)` writes the database
  password into your log pipeline, which has far more readers than your vault.

The fix is one function that runs at startup, reports **every** problem at
once, and returns a config whose secrets cannot be printed by accident.

## Task

Export `class Secret`, `class ConfigError extends Error` and `loadConfig(env)`.
`loadConfig` reads only the object it is given (never `process.env`) and
ignores keys it does not know.

| Variable | Config key | Rule | Default |
| --- | --- | --- | --- |
| `PORT` | `port` | a decimal integer 1–65535 (`"3000abc"`, `"0"`, `"80.5"` are invalid) | `3000` |
| `NODE_ENV` | `env` | `development`, `test` or `production` | `'development'` |
| `LOG_LEVEL` | `logLevel` | `debug`, `info`, `warn` or `error` | `'info'` |
| `ENABLE_SIGNUPS` | `enableSignups` | exactly `"true"` or `"false"`, to a boolean | `false` |
| `DATABASE_URL` | `databaseUrl` | **required**; parses with `new URL()` and its protocol is `postgres:` or `postgresql:`. A `Secret`. | — |
| `SESSION_SECRET` | `sessionSecret` | **required**; at least 32 characters. A `Secret`. | — |

- An **empty string counts as missing** (it is what `FOO=` in an env file
  gives you): a default applies, or a required key is a problem.
- Collect problems for **all** keys, then, if there are any, throw one
  `ConfigError` whose `problems` is an array with **exactly one string per bad
  variable**, each starting with the variable's name and a space (e.g.
  `"PORT must be an integer from 1 to 65535"`). Its `message` must contain
  every problem, and `name` is `'ConfigError'`.
- **A problem never quotes a secret's value.** `DATABASE_URL` is invalid? Say
  so — do not echo it; it probably contains a password. (Echoing a bad
  `PORT` is fine.)
- The returned config is **frozen**.

`new Secret(value)` wraps a string so it is safe to pass around:

- `secret.reveal()` returns the real value — the one deliberate way out.
- `JSON.stringify`, `String(secret)` / template literals, and `util.inspect`
  (which is what `console.log` uses) all show `[REDACTED]`.
- The value must not be reachable as an ordinary property: even
  `util.inspect(secret, { customInspect: false })` and `Object.values(secret)`
  must not contain it. Keep it in a `#private` field.

So `JSON.stringify(loadConfig(env))` is safe to log:

```json
{"port":3000,"env":"development","logLevel":"info","enableSignups":false,
 "databaseUrl":"[REDACTED]","sessionSecret":"[REDACTED]"}
```
