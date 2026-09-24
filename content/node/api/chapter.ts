import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'node-api',
  title: 'API Engineering',
  summary: 'Input validation, error envelopes, signed tokens, and rate limits.',
  lessons: [
    {
      id: 'node-validation',
      title: 'Validating query input',
      kind: 'node',
      xp: 75,
      why: '`?limit=-1` and `?limit=abc` are how a list endpoint becomes an outage.',
      tags: ['validation', 'api design', 'defensive coding'],
      hints: [
        'Accumulate into a `fields = {}` object as you go, and throw once at the end if `Object.keys(fields).length`.',
        'For a strict integer, test the raw string: `/^-?\\d+$/.test(raw)` before converting. `Number("12abc")` is NaN but `parseInt("12abc")` is 12 — that silent truncation is the bug you are preventing.',
        'A missing parameter (`null` from `searchParams.get`) is not an error — it takes the default. Only a *present but invalid* value is.',
        'Normalise the direction with `raw.toLowerCase()` before checking membership.',
      ],
    },
    {
      id: 'node-error-envelope',
      title: 'One error envelope for the whole API',
      kind: 'node',
      xp: 85,
      why: 'Consistent errors are the difference between a client that handles failure and a client that shows "undefined".',
      tags: ['errors', 'api design', 'security'],
      hints: [
        'Set `this.name = "ApiError"` and keep `status`, `code`, `details` as own properties.',
        'Branch on `error instanceof ApiError`. Everything else is a bug you did not anticipate, so it gets the generic 500 body — while you still log the real one.',
        'Build the body then delete the empty parts, or construct conditionally: `...(details ? { details } : {})` inside the object literal.',
        'For `handler`, return `async (req, res) => { try { await fn(req, res) } catch (e) { const { status, body } = toResponse(e); ...respond } }`.',
      ],
    },
    {
      id: 'node-signed-tokens',
      title: 'Signed tokens with node:crypto',
      kind: 'node',
      xp: 100,
      why: 'You will be asked how sessions work. "The token is signed, not encrypted" is the answer, and this is why.',
      tags: ['crypto', 'auth', 'security'],
      hints: [
        '`crypto.createHmac(\'sha256\', secret).update(data).digest(\'base64url\')` is the whole signing step.',
        'Node\'s Buffer supports \'base64url\' directly — `Buffer.from(str, \'base64url\').toString(\'utf8\')` to decode.',
        '`timingSafeEqual` throws if the two buffers differ in length, so compare lengths first and return false rather than letting it throw.',
        'Order of checks in verify: split into exactly two parts → recompute and compare the signature → only then parse the payload and check `exp`. Reversing the last two lets an attacker act on a payload you have not authenticated.',
        'Wrap the JSON parse in try/catch and throw your own `invalid token` error, so a malformed payload never surfaces a SyntaxError.',
      ],
    },
    {
      id: 'node-rate-limit',
      title: 'A rate limiter that tells the truth',
      kind: 'node',
      xp: 95,
      why: 'The cheapest protection you can add to an API, and the headers are half the value.',
      tags: ['rate limiting', 'middleware', 'api design'],
      hints: [
        'Store `{ tokens, lastRefill }` per key. On each check, first refill: `const elapsed = now() - lastRefill; tokens = Math.min(capacity, tokens + (elapsed / 1000) * refillPerSecond)`.',
        'Keep tokens as a float. Rounding to integers loses the partial refill and makes the limiter drift.',
        'Always update `lastRefill` to the current time after refilling, whether or not the request is allowed.',
        'For `retryAfterMs`, the deficit is `1 - tokens`; the wait is `(deficit / refillPerSecond) * 1000`, rounded up with `Math.ceil`.',
        'Headers must be set *before* `res.writeHead` for the 429, and also on the success path before calling `next()`.',
      ],
    },
  ],
});
