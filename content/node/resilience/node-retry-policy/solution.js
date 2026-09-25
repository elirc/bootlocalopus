const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

// The server never processed the request: safe to resend whatever it was.
const ALWAYS_CODES = new Set(['ECONNREFUSED']);
const ALWAYS_STATUSES = new Set([429]);
// Transient, but the server may have acted on it before the failure.
const AMBIGUOUS_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN']);
const AMBIGUOUS_STATUSES = new Set([408, 502, 503, 504]);

const isSafe = ({ method, idempotencyKey }) =>
  (typeof method === 'string' && IDEMPOTENT.has(method.toUpperCase())) ||
  (typeof idempotencyKey === 'string' && idempotencyKey !== '');

const classify = (failure) => {
  const { status, errorCode } = failure;
  if (ALWAYS_CODES.has(errorCode) || ALWAYS_STATUSES.has(status)) return undefined;
  if (AMBIGUOUS_CODES.has(errorCode) || AMBIGUOUS_STATUSES.has(status)) {
    return isSafe(failure) ? undefined : 'not-idempotent';
  }
  return 'not-retryable';
};

/** Milliseconds the server asked us to wait, or undefined if it did not (validly) ask. */
const IMF_FIXDATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

const retryAfterMs = (value, now) => {
  if (typeof value !== 'string') return undefined;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  // Date.parse accepts almost anything ('-5' is a date in 2001), so check the shape first.
  if (!IMF_FIXDATE.test(value)) return undefined;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now()) : undefined;
};

export function retryDecision(attempt, failure, { maxAttempts = 3, baseMs = 100, maxDelayMs = 10_000, now = Date.now, random = Math.random } = {}) {
  if (attempt >= maxAttempts) return { retry: false, reason: 'attempts-exhausted' };

  const refusal = classify(failure);
  if (refusal) return { retry: false, reason: refusal };

  const asked = retryAfterMs((failure.headers ?? {})['retry-after'], now);
  if (asked !== undefined) {
    // Retrying sooner ignores the server; waiting longer blows our own budget. Give up.
    if (asked > maxDelayMs) return { retry: false, reason: 'retry-after-too-long' };
    return { retry: true, delayMs: asked };
  }

  const cap = Math.min(maxDelayMs, baseMs * 2 ** (attempt - 1));
  return { retry: true, delayMs: Math.floor(random() * cap) };
}
