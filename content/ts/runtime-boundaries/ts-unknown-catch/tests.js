const { toError, errorMessage, wrapError } = solution;

describe('toError', () => {
  it('returns a real Error untouched, subclasses included', () => {
    const e = new TypeError('bad');
    expect(toError(e)).toBe(e);
    class HttpError extends Error { constructor(status) { super('http ' + status); this.status = status; } }
    const h = new HttpError(503);
    expect(toError(h)).toBe(h);
  });
  it('turns a thrown string into an Error with that message', () => {
    const e = toError('disk full');
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe('disk full');
    expect(e.cause).toBe('disk full');
  });
  it('uses the message of an error-like object, and keeps the object as cause', () => {
    const thrown = { message: 'rate limited', code: 'E_RATE' };
    const e = toError(thrown);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe('rate limited');
    expect(e.cause).toBe(thrown);
  });
  it('does not trust a message that is not a string', () => {
    const thrown = { message: 42 };
    const e = toError(thrown);
    expect(e.message).toBe('Non-error thrown: {"message":42}');
    expect(e.cause).toBe(thrown);
  });
  it('describes other values as JSON', () => {
    expect(toError(null).message).toBe('Non-error thrown: null');
    expect(toError(42).message).toBe('Non-error thrown: 42');
    expect(toError({ code: 'E1' }).message).toBe('Non-error thrown: {"code":"E1"}');
    expect(toError([1, 'a']).message).toBe('Non-error thrown: [1,"a"]');
  });
  it('falls back to String() when there is no JSON for the value', () => {
    expect(toError(undefined).message).toBe('Non-error thrown: undefined');
    expect(toError(Symbol('boom')).message).toBe('Non-error thrown: Symbol(boom)');
  });
  it('never throws while describing a value', () => {
    const circular = { name: 'loop' };
    circular.self = circular;
    expect(toError(circular).message).toBe('Non-error thrown: [object Object]');
    expect(toError(10n).message).toBe('Non-error thrown: 10');
    const bare = Object.create(null);
    expect(toError(bare).message).toBe('Non-error thrown: {}');
  });
  it('keeps the original value as cause, even undefined', () => {
    const e = toError(undefined);
    expect(Object.hasOwn(e, 'cause')).toBe(true);
    expect(e.cause).toBeUndefined();
    expect(toError(7).cause).toBe(7);
  });
});

describe('errorMessage', () => {
  it('is the message toError would give', () => {
    expect(errorMessage(new RangeError('too big'))).toBe('too big');
    expect(errorMessage('plain')).toBe('plain');
    expect(errorMessage({ message: 'shaped' })).toBe('shaped');
    expect(errorMessage(null)).toBe('Non-error thrown: null');
  });
  it('works on whatever a catch block receives', () => {
    let msg;
    try { JSON.parse('{oops'); } catch (e) { msg = errorMessage(e); }
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
    try { throw 'thrown string'; } catch (e) { msg = errorMessage(e); }
    expect(msg).toBe('thrown string');
  });
});

describe('wrapError', () => {
  it('prefixes the context and keeps the ORIGINAL value as cause', () => {
    const inner = new Error('connection refused');
    const e = wrapError('loading user 7', inner);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe('loading user 7: connection refused');
    expect(e.cause).toBe(inner);
  });
  it('wraps non-errors without normalising the cause', () => {
    const thrown = { code: 'E1' };
    const e = wrapError('saving', thrown);
    expect(e.message).toBe('saving: Non-error thrown: {"code":"E1"}');
    expect(e.cause).toBe(thrown);
  });
  it('always returns a new Error, never the one it wraps', () => {
    const inner = new Error('x');
    expect(wrapError('ctx', inner)).not.toBe(inner);
  });
});
