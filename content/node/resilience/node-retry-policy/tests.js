const NOW = Date.UTC(2024, 0, 1, 12, 0, 0);
const base = { now: () => NOW, random: () => 0.5 };
const decide = (attempt, failure, opts = {}) => solution.retryDecision(attempt, failure, { ...base, ...opts });

describe('attempts', () => {
  it('stops at maxAttempts before looking at anything else', () => {
    expect(decide(3, { method: 'GET', status: 503 })).toEqual({ retry: false, reason: 'attempts-exhausted' });
    expect(decide(5, { method: 'GET', status: 400 }, { maxAttempts: 5 })).toEqual({ retry: false, reason: 'attempts-exhausted' });
    expect(decide(2, { method: 'GET', status: 503 }).retry).toBe(true);
    expect(decide(1, { method: 'GET', status: 503 }, { maxAttempts: 1 })).toEqual({ retry: false, reason: 'attempts-exhausted' });
  });

  it('defaults to 3 attempts and real options when none are given', () => {
    expect(solution.retryDecision(3, { method: 'GET', status: 503 })).toEqual({ retry: false, reason: 'attempts-exhausted' });
    const d = solution.retryDecision(1, { method: 'GET', status: 503 });
    expect(d.retry).toBe(true);
    expect(d.delayMs).toBeGreaterThanOrEqual(0);
    expect(d.delayMs).toBeLessThan(100);
  });
});

describe('classification', () => {
  it('never retries client errors or 500', () => {
    for (const status of [400, 401, 403, 404, 409, 422, 500, 501]) {
      expect([status, decide(1, { method: 'GET', status })]).toEqual([status, { retry: false, reason: 'not-retryable' }]);
    }
    expect(decide(1, { method: 'GET', errorCode: 'ERR_INVALID_URL' })).toEqual({ retry: false, reason: 'not-retryable' });
    expect(decide(1, { method: 'GET', errorCode: 'ENOTFOUND' })).toEqual({ retry: false, reason: 'not-retryable' });
  });

  it('retries ambiguous failures only for safe requests', () => {
    const ambiguous = [{ status: 408 }, { status: 502 }, { status: 503 }, { status: 504 }, { errorCode: 'ECONNRESET' }, { errorCode: 'ETIMEDOUT' }, { errorCode: 'EPIPE' }, { errorCode: 'EAI_AGAIN' }];
    for (const f of ambiguous) {
      for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'get', 'Delete']) {
        expect([f, method, decide(1, { method, ...f }).retry]).toEqual([f, method, true]);
      }
      for (const method of ['POST', 'PATCH', 'post', undefined]) {
        expect([f, method, decide(1, { method, ...f })]).toEqual([f, method, { retry: false, reason: 'not-idempotent' }]);
      }
    }
  });

  it('treats an idempotency key as making any method safe', () => {
    expect(decide(1, { method: 'POST', status: 503, idempotencyKey: 'order-42' }).retry).toBe(true);
    expect(decide(1, { method: 'PATCH', errorCode: 'ECONNRESET', idempotencyKey: 'k' }).retry).toBe(true);
    expect(decide(1, { method: 'POST', status: 503, idempotencyKey: '' })).toEqual({ retry: false, reason: 'not-idempotent' });
    expect(decide(1, { method: 'POST', status: 503, idempotencyKey: 42 })).toEqual({ retry: false, reason: 'not-idempotent' });
  });

  it('always retries refused connections and 429s, even for POST', () => {
    expect(decide(1, { method: 'POST', errorCode: 'ECONNREFUSED' }).retry).toBe(true);
    expect(decide(1, { method: 'POST', status: 429 }).retry).toBe(true);
  });
});

describe('Retry-After', () => {
  it('obeys delta-seconds exactly, without jitter', () => {
    expect(decide(1, { method: 'GET', status: 503, headers: { 'retry-after': '3' } })).toEqual({ retry: true, delayMs: 3000 });
    expect(decide(1, { method: 'POST', status: 429, headers: { 'retry-after': '0' } })).toEqual({ retry: true, delayMs: 0 });
    expect(decide(2, { method: 'GET', status: 429, headers: { 'retry-after': '10' } })).toEqual({ retry: true, delayMs: 10_000 });
  });

  it('obeys an HTTP date relative to now, never negative', () => {
    const in5s = new Date(NOW + 5000).toUTCString();
    expect(decide(1, { method: 'GET', status: 503, headers: { 'retry-after': in5s } })).toEqual({ retry: true, delayMs: 5000 });
    const past = new Date(NOW - 60_000).toUTCString();
    expect(decide(1, { method: 'GET', status: 503, headers: { 'retry-after': past } })).toEqual({ retry: true, delayMs: 0 });
  });

  it('gives up rather than wait longer than maxDelayMs', () => {
    expect(decide(1, { method: 'GET', status: 429, headers: { 'retry-after': '11' } })).toEqual({ retry: false, reason: 'retry-after-too-long' });
    expect(decide(1, { method: 'GET', status: 429, headers: { 'retry-after': '3600' } }, { maxDelayMs: 60_000 })).toEqual({ retry: false, reason: 'retry-after-too-long' });
    const later = new Date(NOW + 20_000).toUTCString();
    expect(decide(1, { method: 'GET', status: 503, headers: { 'retry-after': later } })).toEqual({ retry: false, reason: 'retry-after-too-long' });
  });

  it('ignores an invalid header and falls back to backoff', () => {
    for (const value of ['soon', '-5', '1.5', '']) {
      expect([value, decide(1, { method: 'GET', status: 503, headers: { 'retry-after': value } })]).toEqual([value, { retry: true, delayMs: 50 }]);
    }
  });

  it('does not let Retry-After override the classification', () => {
    expect(decide(1, { method: 'POST', status: 503, headers: { 'retry-after': '1' } })).toEqual({ retry: false, reason: 'not-idempotent' });
    expect(decide(1, { method: 'GET', status: 500, headers: { 'retry-after': '1' } })).toEqual({ retry: false, reason: 'not-retryable' });
  });
});

describe('backoff', () => {
  it('doubles the cap per attempt with full jitter', () => {
    const f = { method: 'GET', status: 503 };
    const opts = { maxAttempts: 10, baseMs: 100 };
    expect(decide(1, f, opts)).toEqual({ retry: true, delayMs: 50 });
    expect(decide(2, f, opts)).toEqual({ retry: true, delayMs: 100 });
    expect(decide(3, f, opts)).toEqual({ retry: true, delayMs: 200 });
    expect(decide(4, f, { ...opts, random: () => 0.999 })).toEqual({ retry: true, delayMs: 799 });
    expect(decide(4, f, { ...opts, random: () => 0 })).toEqual({ retry: true, delayMs: 0 });
  });

  it('caps the backoff at maxDelayMs', () => {
    const f = { method: 'GET', errorCode: 'ECONNRESET' };
    expect(decide(9, f, { maxAttempts: 20, baseMs: 100, maxDelayMs: 1000, random: () => 0.5 })).toEqual({ retry: true, delayMs: 500 });
  });

  it('works without headers', () => {
    expect(decide(1, { method: 'GET', status: 502, headers: undefined })).toEqual({ retry: true, delayMs: 50 });
  });
});
