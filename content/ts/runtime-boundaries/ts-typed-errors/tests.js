const { AppError, isAppError, findAppError, toProblem, ERROR_CODES } = solution;

describe('AppError', () => {
  it('is an Error with a name, code and status from the table', () => {
    const e = new AppError('NOT_FOUND', 'Order o_1 not found');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(AppError);
    expect(e.name).toBe('AppError');
    expect(e.message).toBe('Order o_1 not found');
    expect(e.code).toBe('NOT_FOUND');
    expect(e.status).toBe(404);
    expect(e.details).toBeUndefined();
    expect(typeof e.stack).toBe('string');
  });
  it('takes a cause and details', () => {
    const root = new Error('unique_violation');
    const e = new AppError('CONFLICT', 'Email taken', { cause: root, details: { field: 'email' } });
    expect(e.cause).toBe(root);
    expect(e.details).toEqual({ field: 'email' });
    expect(e.status).toBe(409);
  });
  it('has no own cause when none was given', () => {
    expect(Object.hasOwn(new AppError('FORBIDDEN', 'no'), 'cause')).toBe(false);
  });
  it('covers every code in the table', () => {
    const statuses = Object.keys(ERROR_CODES).map((code) => new AppError(code, 'x').status);
    expect(statuses).toEqual([401, 403, 404, 409, 422, 429, 500]);
  });
});

describe('isAppError', () => {
  it('checks the class, and the code when given', () => {
    const e = new AppError('RATE_LIMITED', 'slow down');
    expect(isAppError(e)).toBe(true);
    expect(isAppError(e, 'RATE_LIMITED')).toBe(true);
    expect(isAppError(e, 'NOT_FOUND')).toBe(false);
  });
  it('rejects look-alikes', () => {
    expect(isAppError(new Error('x'))).toBe(false);
    expect(isAppError({ name: 'AppError', code: 'NOT_FOUND', status: 404, message: 'x' })).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError('NOT_FOUND')).toBe(false);
  });
});

describe('findAppError', () => {
  it('returns the value itself when it is one', () => {
    const e = new AppError('FORBIDDEN', 'nope');
    expect(findAppError(e)).toBe(e);
  });
  it('walks the cause chain to the first AppError', () => {
    const inner = new AppError('NOT_FOUND', 'no such user');
    const outer = new AppError('CONFLICT', 'outer');
    const wrapped = new Error('loading profile', { cause: new Error('repo', { cause: inner }) });
    expect(findAppError(wrapped)).toBe(inner);
    expect(findAppError(new Error('x', { cause: outer }))).toBe(outer);
  });
  it('returns undefined when there is none', () => {
    expect(findAppError(new Error('a', { cause: new Error('b') }))).toBeUndefined();
    expect(findAppError(new Error('a', { cause: 'a string cause' }))).toBeUndefined();
    expect(findAppError(undefined)).toBeUndefined();
    expect(findAppError({ cause: new AppError('NOT_FOUND', 'hidden in a plain object') })).toBeUndefined();
  });
  it('stops on a cause cycle instead of looping forever', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    a.cause = b;
    expect(findAppError(a)).toBeUndefined();
    const self = new Error('self');
    self.cause = self;
    expect(findAppError(self)).toBeUndefined();
  });
});

describe('toProblem', () => {
  it('describes an exposed AppError', () => {
    expect(toProblem(new AppError('NOT_FOUND', 'Order o_1 not found'))).toStrictEqual({
      type: 'https://errors.example.com/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'Order o_1 not found',
    });
  });
  it('includes details and instance when present', () => {
    const e = new AppError('VALIDATION', 'Invalid order', { details: { fields: ['qty'] } });
    expect(toProblem(e, '/orders/o_1')).toStrictEqual({
      type: 'https://errors.example.com/validation',
      title: 'Unprocessable Content',
      status: 422,
      detail: 'Invalid order',
      details: { fields: ['qty'] },
      instance: '/orders/o_1',
    });
  });
  it('slugs multi-word codes', () => {
    expect(toProblem(new AppError('RATE_LIMITED', 'x')).type).toBe('https://errors.example.com/rate-limited');
  });
  it('finds an AppError wrapped by lower layers', () => {
    const wrapped = new Error('handler failed', { cause: new AppError('FORBIDDEN', 'Not your order') });
    expect(toProblem(wrapped).status).toBe(403);
    expect(toProblem(wrapped).detail).toBe('Not your order');
  });
  it('never leaks the message of an unknown error', () => {
    const leak = new Error('connect ECONNREFUSED 10.0.3.7:5432 password=hunter2');
    expect(toProblem(leak)).toStrictEqual({ type: 'about:blank', title: 'Internal Server Error', status: 500 });
    expect(toProblem('thrown string', '/x')).toStrictEqual({ type: 'about:blank', title: 'Internal Server Error', status: 500, instance: '/x' });
  });
  it('does not expose an INTERNAL AppError either, or its details', () => {
    const e = new AppError('INTERNAL', 'ledger mismatch for account 991', { details: { account: 991 } });
    expect(toProblem(e)).toStrictEqual({ type: 'about:blank', title: 'Internal Server Error', status: 500 });
  });
  it('returns a fresh object every time', () => {
    const a = toProblem(null);
    a.title = 'changed';
    expect(toProblem(null).title).toBe('Internal Server Error');
  });
});
