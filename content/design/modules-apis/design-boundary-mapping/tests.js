const { toUserResponse, toUserListResponse, fromCreateUserRequest, fromUpdateUserRequest, RequestValidationError } = solution;

const row = (o = {}) => ({
  id: 42,
  email: 'ada@example.com',
  display_name: 'Ada',
  password_hash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA',
  role: 'member',
  created_at: new Date('2024-03-01T09:30:00.000Z'),
  deleted_at: null,
  stripe_customer_id: 'cus_123',
  ...o,
});
const self = { id: '42', role: 'member' };
const stranger = { id: '7', role: 'member' };
const admin = { id: '1', role: 'admin' };
const errorOf = (fn) => { try { fn(); } catch (e) { return e; } return null; };

describe('rows out: toUserResponse', () => {
  it('shows a user their own profile, in API shape', () => {
    expect(toUserResponse(row(), self)).toStrictEqual({
      id: '42',
      displayName: 'Ada',
      createdAt: '2024-03-01T09:30:00.000Z',
      email: 'ada@example.com',
      role: 'member',
    });
  });

  it('shows other users only the public fields', () => {
    expect(toUserResponse(row(), stranger)).toStrictEqual({
      id: '42',
      displayName: 'Ada',
      createdAt: '2024-03-01T09:30:00.000Z',
    });
    expect(toUserResponse(row(), undefined)).toStrictEqual({
      id: '42',
      displayName: 'Ada',
      createdAt: '2024-03-01T09:30:00.000Z',
    });
  });

  it('shows admins the private fields', () => {
    expect(toUserResponse(row(), admin).email).toBe('ada@example.com');
    expect(toUserResponse(row(), admin).role).toBe('member');
  });

  it('compares ids whatever their type (numeric column, string from a token)', () => {
    expect(toUserResponse(row({ id: 42 }), { id: '42', role: 'member' }).email).toBe('ada@example.com');
    expect(toUserResponse(row({ id: '42' }), { id: 42, role: 'member' }).email).toBe('ada@example.com');
  });

  it('never leaks a column nobody chose to expose, including ones added later', () => {
    const json = JSON.stringify(toUserResponse(row({ mfa_secret: 'JBSWY3DPEHPK3PXP', internal_notes: 'VIP' }), admin));
    for (const secret of ['argon2', 'cus_123', 'JBSWY3DP', 'VIP', 'deleted', 'password', 'stripe', '_']) {
      expect(json.includes(secret)).toBe(false);
    }
  });

  it('maps lists with the same rules and a cursor', () => {
    const rows = [row(), row({ id: 7, email: 'bob@example.com', display_name: 'Bob' })];
    const res = toUserListResponse(rows, stranger, 'abc');
    expect(res.nextCursor).toBe('abc');
    expect(res.data.map((u) => u.id)).toEqual(['42', '7']);
    expect(res.data[0].email).toBeUndefined();
    expect(res.data[1].email).toBe('bob@example.com');
    expect(toUserListResponse([], stranger)).toEqual({ data: [], nextCursor: null });
  });
});

describe('requests in: fromCreateUserRequest', () => {
  it('reads and normalises only the fields a client may set', () => {
    expect(fromCreateUserRequest({ email: '  Ada@Example.COM ', displayName: '  Ada  ' }))
      .toStrictEqual({ email: 'ada@example.com', displayName: 'Ada' });
  });

  it('ignores fields a client must not set (mass assignment)', () => {
    const input = fromCreateUserRequest({
      email: 'ada@example.com', displayName: 'Ada',
      role: 'admin', id: 1, isAdmin: true, password_hash: 'x', created_at: '1970-01-01',
    });
    expect(input).toStrictEqual({ email: 'ada@example.com', displayName: 'Ada' });
  });

  it('reports every invalid field at once', () => {
    const e = errorOf(() => fromCreateUserRequest({ email: 'not-an-email', displayName: '   ' }));
    expect(e).toBeInstanceOf(RequestValidationError);
    expect(e.name).toBe('RequestValidationError');
    expect(Object.keys(e.fields).sort()).toEqual(['displayName', 'email']);
  });

  it('rejects wrong types rather than coercing them', () => {
    expect(Object.keys(errorOf(() => fromCreateUserRequest({ email: ['ada@example.com'], displayName: 'Ada' })).fields)).toEqual(['email']);
    expect(Object.keys(errorOf(() => fromCreateUserRequest({ email: 'ada@example.com', displayName: 42 })).fields)).toEqual(['displayName']);
    expect(errorOf(() => fromCreateUserRequest({ email: 'ada@example.com', displayName: 'x'.repeat(51) }))).toBeInstanceOf(RequestValidationError);
    expect(fromCreateUserRequest({ email: 'ada@example.com', displayName: 'x'.repeat(50) }).displayName).toHaveLength(50);
  });

  it('rejects a body that is not an object', () => {
    for (const body of [null, 'ada', [], 42, undefined]) {
      const e = errorOf(() => fromCreateUserRequest(body));
      expect(e).toBeInstanceOf(RequestValidationError);
      expect(e.fields).toEqual({ body: 'must be a JSON object' });
    }
  });
});

describe('requests in: fromUpdateUserRequest', () => {
  it('returns a patch with only the fields that were sent', () => {
    expect(fromUpdateUserRequest({ displayName: ' Ada L. ' })).toStrictEqual({ displayName: 'Ada L.' });
  });

  it('never lets an update change email, role or id', () => {
    expect(fromUpdateUserRequest({ displayName: 'Ada', email: 'evil@example.com', role: 'admin', id: 1 }))
      .toStrictEqual({ displayName: 'Ada' });
  });

  it('rejects an update with nothing updatable in it', () => {
    const e = errorOf(() => fromUpdateUserRequest({ role: 'admin' }));
    expect(e).toBeInstanceOf(RequestValidationError);
    expect(e.fields).toEqual({ body: 'nothing to update' });
    expect(errorOf(() => fromUpdateUserRequest({})).fields).toEqual({ body: 'nothing to update' });
  });

  it('validates the fields it does accept', () => {
    const e = errorOf(() => fromUpdateUserRequest({ displayName: '' }));
    expect(e).toBeInstanceOf(RequestValidationError);
    expect(Object.keys(e.fields)).toEqual(['displayName']);
  });
});
