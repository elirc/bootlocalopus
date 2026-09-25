import crypto from 'node:crypto';

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const MIN = 60_000;

const setup = (opts = {}) => {
  const clock = { t: 1_700_000_000_000 };
  const accounts = new Map([
    ['alice@example.com', { id: 'u1', email: 'alice@example.com' }],
    ['bob@example.com', { id: 'u2', email: 'bob@example.com' }],
  ]);
  const passwords = new Map();
  const sent = [];
  const changed = [];
  const tokens = new Map();
  const users = {
    findByEmail: async (email) => {
      await null;
      return accounts.get(email);
    },
    setPassword: async (id, pw) => {
      await new Promise((r) => setTimeout(r, 5));
      passwords.set(id, pw);
    },
  };
  const mailer = { send: async (to, token) => { await null; sent.push({ to, token }); } };
  const service = solution.createResetService({
    users, mailer, tokens, now: () => clock.t, onPasswordChanged: async (id) => { changed.push(id); }, ...opts,
  });
  const last = () => sent[sent.length - 1].token;
  return { service, clock, passwords, sent, changed, tokens, last };
};

const codeOf = async (promise) => {
  try {
    await promise;
    return 'resolved';
  } catch (e) {
    return e instanceof solution.ResetError ? e.code : 'not a ResetError: ' + e;
  }
};

const GOOD = 'correct horse battery';

describe('requestReset', () => {
  it('mails a long random token to the account email', async () => {
    const { service, sent } = setup();
    expect(await service.requestReset('alice@example.com')).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('alice@example.com');
    expect(sent[0].token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await service.requestReset('alice@example.com');
    expect(sent[1].token).not.toBe(sent[0].token);
  });

  it('normalises the email', async () => {
    const { service, sent } = setup();
    await service.requestReset('  Alice@Example.COM ');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('alice@example.com');
  });

  it('answers the same for an unknown email and stores nothing', async () => {
    const { service, sent, tokens } = setup();
    expect(await service.requestReset('mallory@example.com')).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
    expect(tokens.size).toBe(0);
  });

  it('stores only the SHA-256 hash of the token', async () => {
    const { service, tokens, last, clock } = setup();
    await service.requestReset('alice@example.com');
    const token = last();
    expect([...tokens.keys()]).toEqual([sha(token)]);
    expect(tokens.get(sha(token))).toEqual({ userId: 'u1', expiresAt: clock.t + 30 * MIN });
    for (const [k, v] of tokens) {
      expect(JSON.stringify([k, v]).includes(token)).toBe(false);
    }
  });

  it('replaces the previous link for that user only', async () => {
    const { service, tokens, sent } = setup();
    await service.requestReset('alice@example.com');
    await service.requestReset('bob@example.com');
    await service.requestReset('alice@example.com');
    expect(tokens.size).toBe(2);
    expect(await codeOf(service.resetPassword(sent[0].token, GOOD))).toBe('invalid-token');
    expect(await codeOf(service.resetPassword(sent[1].token, GOOD))).toBe('resolved');
    expect(await codeOf(service.resetPassword(sent[2].token, GOOD))).toBe('resolved');
  });
});

describe('resetPassword', () => {
  it('sets the password and revokes sessions', async () => {
    const { service, passwords, changed, last, tokens } = setup();
    await service.requestReset('alice@example.com');
    expect(await service.resetPassword(last(), GOOD)).toEqual({ ok: true });
    expect(passwords.get('u1')).toBe(GOOD);
    expect(changed).toEqual(['u1']);
    expect(tokens.size).toBe(0);
  });

  it('works exactly once', async () => {
    const { service, last, changed } = setup();
    await service.requestReset('alice@example.com');
    const token = last();
    await service.resetPassword(token, GOOD);
    expect(await codeOf(service.resetPassword(token, 'another long password'))).toBe('invalid-token');
    expect(changed).toEqual(['u1']);
  });

  it('lets only one of two concurrent uses succeed', async () => {
    const { service, last, passwords } = setup();
    await service.requestReset('alice@example.com');
    const token = last();
    const results = await Promise.all([
      codeOf(service.resetPassword(token, 'first long password')),
      codeOf(service.resetPassword(token, 'second long password')),
    ]);
    expect(results.sort()).toEqual(['invalid-token', 'resolved']);
    expect(passwords.get('u1')).toBe('first long password');
  });

  it('expires at exactly ttlMs', async () => {
    const { service, last, clock, tokens } = setup({ ttlMs: 10 * MIN });
    await service.requestReset('alice@example.com');
    const a = last();
    clock.t += 10 * MIN - 1;
    await service.requestReset('bob@example.com');
    const b = last();
    expect(await codeOf(service.resetPassword(a, GOOD))).toBe('resolved');
    clock.t += 10 * MIN;
    expect(await codeOf(service.resetPassword(b, GOOD))).toBe('invalid-token');
    expect(tokens.size).toBe(0);
  });

  it('rejects a weak password without burning the token', async () => {
    const { service, last, passwords } = setup();
    await service.requestReset('alice@example.com');
    const token = last();
    for (const pw of ['short', '12345678901', '', undefined, 123456789012]) {
      expect(await codeOf(service.resetPassword(token, pw))).toBe('weak-password');
    }
    expect(passwords.size).toBe(0);
    expect(await codeOf(service.resetPassword(token, '123456789012'))).toBe('resolved');
  });

  it('checks the token before the password', async () => {
    const { service } = setup();
    expect(await codeOf(service.resetPassword('nope', 'x'))).toBe('invalid-token');
  });

  it('rejects junk tokens, including the stored hash itself', async () => {
    const { service, last } = setup();
    await service.requestReset('alice@example.com');
    const token = last();
    for (const t of [undefined, null, 42, '', token.slice(0, -1), token + 'A', sha(token)]) {
      expect(await codeOf(service.resetPassword(t, GOOD))).toBe('invalid-token');
    }
    expect(await codeOf(service.resetPassword(token, GOOD))).toBe('resolved');
  });
});
