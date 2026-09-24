describe('AppError', () => {
  it('is a real Error with a stack', () => {
    const e = new solution.AppError('something broke');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(solution.AppError);
    expect(e.message).toBe('something broke');
    expect(typeof e.stack).toBe('string');
  });
  it('defaults code and status', () => {
    const e = new solution.AppError('x');
    expect(e.code).toBe('APP_ERROR');
    expect(e.status).toBe(500);
    expect(e.name).toBe('AppError');
  });
  it('accepts code, status and cause', () => {
    const root = new Error('socket closed');
    const e = new solution.AppError('upstream failed', { code: 'UPSTREAM', status: 502, cause: root });
    expect(e.code).toBe('UPSTREAM');
    expect(e.status).toBe(502);
    expect(e.cause).toBe(root);
  });
  it('serialises for a log line', () => {
    const e = new solution.AppError('nope', { code: 'X', status: 503 });
    expect(e.toJSON()).toEqual({ name: 'AppError', message: 'nope', code: 'X', status: 503 });
  });
  it('survives JSON.stringify', () => {
    const parsed = JSON.parse(JSON.stringify(new solution.AppError('nope', { code: 'X' })));
    expect(parsed.code).toBe('X');
  });
});

describe('ValidationError', () => {
  it('carries the offending fields', () => {
    const e = new solution.ValidationError('invalid signup', { email: 'must be an email' });
    expect(e).toBeInstanceOf(solution.AppError);
    expect(e).toBeInstanceOf(solution.ValidationError);
    expect(e.name).toBe('ValidationError');
    expect(e.code).toBe('VALIDATION');
    expect(e.status).toBe(400);
    expect(e.fields).toEqual({ email: 'must be an email' });
  });
  it('defaults fields to an empty object', () => {
    expect(new solution.ValidationError('bad').fields).toEqual({});
  });
});

describe('NotFoundError', () => {
  it('builds its own message', () => {
    const e = new solution.NotFoundError('User', 42);
    expect(e.message).toBe('User 42 not found');
    expect(e.status).toBe(404);
    expect(e.code).toBe('NOT_FOUND');
    expect(e.resource).toBe('User');
    expect(e.id).toBe(42);
    expect(e.name).toBe('NotFoundError');
  });
});

describe('the point of all this: branching', () => {
  it('lets a caller handle each failure differently', () => {
    const handle = (error) => {
      if (error instanceof solution.ValidationError) return 'show form errors';
      if (error instanceof solution.NotFoundError) return '404 page';
      if (error instanceof solution.AppError) return 'generic error page';
      return 'unknown';
    };
    expect(handle(new solution.ValidationError('x'))).toBe('show form errors');
    expect(handle(new solution.NotFoundError('Post', 1))).toBe('404 page');
    expect(handle(new solution.AppError('x'))).toBe('generic error page');
    expect(handle(new TypeError('x'))).toBe('unknown');
  });
});

describe('isRetryable', () => {
  it('retries server errors', () => {
    expect(solution.isRetryable(new solution.AppError('x', { status: 503 }))).toBe(true);
    expect(solution.isRetryable(new solution.AppError('x', { status: 500 }))).toBe(true);
  });
  it('does not retry client errors', () => {
    expect(solution.isRetryable(new solution.ValidationError('x'))).toBe(false);
    expect(solution.isRetryable(new solution.NotFoundError('User', 1))).toBe(false);
  });
  it('retries errors with no status at all (network-level)', () => {
    expect(solution.isRetryable(new Error('ECONNRESET'))).toBe(true);
  });
});