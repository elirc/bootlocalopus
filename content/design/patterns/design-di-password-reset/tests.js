const { createPasswordResetService, InvalidTokenError, WeakPasswordError, RESET_TTL_MS } = solution;
const T0 = Date.UTC(2024, 4, 1, 12, 0, 0);
const STRONG = 'correct horse battery';

function setup({ failUpdate = false } = {}) {
  let now = T0;
  let n = 0;
  const sent = [];
  const updates = [];
  const accounts = [{ id: 'u1', email: 'ada@example.com' }, { id: 'u2', email: 'grace@example.com' }];
  let failing = failUpdate;
  const deps = {
    users: {
      async findByEmail(email) { return accounts.find((a) => a.email === email) ?? null; },
      async updatePassword(userId, hash) {
        if (failing) { failing = false; throw new Error('db down'); }
        updates.push([userId, hash]);
      },
    },
    mailer: { async send(message) { sent.push(message); } },
    clock: () => now,
    generateToken: () => `tok-${++n}`,
    hashPassword: async (plain) => `hashed:${plain}`,
  };
  return {
    service: createPasswordResetService(deps),
    sent, updates,
    advance(ms) { now += ms; },
  };
}
const rejection = async (p) => { try { await p; } catch (e) { return e; } throw new Error('expected a rejection'); };

describe('requestReset', () => {
  it('emails a link carrying the generated token', async () => {
    const { service, sent } = setup();
    expect(await service.requestReset('ada@example.com')).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('ada@example.com');
    expect(sent[0].subject).toBe('Reset your password');
    expect(sent[0].text).toContain('https://app.example/reset?token=tok-1');
  });
  it('normalises the email before lookup', async () => {
    const { service, sent } = setup();
    await service.requestReset('  Ada@Example.COM ');
    expect(sent.map((m) => m.to)).toEqual(['ada@example.com']);
  });
  it('does not reveal whether an account exists', async () => {
    const { service, sent } = setup();
    expect(await service.requestReset('nobody@example.com')).toBeUndefined();
    expect(sent).toHaveLength(0);
  });
});

describe('resetPassword', () => {
  it('updates the password with the hash and burns the token', async () => {
    const { service, updates } = setup();
    await service.requestReset('ada@example.com');
    await service.resetPassword('tok-1', STRONG);
    expect(updates).toEqual([['u1', `hashed:${STRONG}`]]);
    const e = await rejection(service.resetPassword('tok-1', STRONG + '!'));
    expect(e).toBeInstanceOf(InvalidTokenError);
    expect(e.name).toBe('InvalidTokenError');
    expect(updates).toHaveLength(1);
  });
  it('rejects unknown tokens', async () => {
    const { service } = setup();
    expect(await rejection(service.resetPassword('tok-999', STRONG))).toBeInstanceOf(InvalidTokenError);
  });
  it('expires exactly RESET_TTL_MS after issue (using the injected clock)', async () => {
    expect(RESET_TTL_MS).toBe(30 * 60 * 1000);
    const a = setup();
    await a.service.requestReset('ada@example.com');
    a.advance(RESET_TTL_MS - 1);
    await a.service.resetPassword('tok-1', STRONG);
    expect(a.updates).toHaveLength(1);

    const b = setup();
    await b.service.requestReset('ada@example.com');
    b.advance(RESET_TTL_MS);
    expect(await rejection(b.service.resetPassword('tok-1', STRONG))).toBeInstanceOf(InvalidTokenError);
    expect(b.updates).toHaveLength(0);
  });
  it('the TTL starts at request time, not at service creation', async () => {
    const { service, advance, updates } = setup();
    advance(2 * RESET_TTL_MS);
    await service.requestReset('ada@example.com');
    advance(RESET_TTL_MS / 2);
    await service.resetPassword('tok-1', STRONG);
    expect(updates).toHaveLength(1);
  });
  it('a weak password is rejected and the token survives', async () => {
    const { service, updates } = setup();
    await service.requestReset('ada@example.com');
    const e = await rejection(service.resetPassword('tok-1', 'short'));
    expect(e).toBeInstanceOf(WeakPasswordError);
    expect(e.name).toBe('WeakPasswordError');
    expect(await rejection(service.resetPassword('tok-1', '12345678901'))).toBeInstanceOf(WeakPasswordError);
    await service.resetPassword('tok-1', '123456789012');
    expect(updates).toEqual([['u1', 'hashed:123456789012']]);
  });
  it('checks the token before the password', async () => {
    const { service } = setup();
    expect(await rejection(service.resetPassword('nope', 'short'))).toBeInstanceOf(InvalidTokenError);
  });
  it('a new request supersedes the previous token for that user only', async () => {
    const { service, updates } = setup();
    await service.requestReset('ada@example.com');   // tok-1
    await service.requestReset('grace@example.com'); // tok-2
    await service.requestReset('ada@example.com');   // tok-3
    expect(await rejection(service.resetPassword('tok-1', STRONG))).toBeInstanceOf(InvalidTokenError);
    await service.resetPassword('tok-2', STRONG);
    await service.resetPassword('tok-3', STRONG);
    expect(updates.map(([id]) => id)).toEqual(['u2', 'u1']);
  });
  it('keeps the token when the password update fails', async () => {
    const { service, updates } = setup({ failUpdate: true });
    await service.requestReset('ada@example.com');
    const e = await rejection(service.resetPassword('tok-1', STRONG));
    expect(e.message).toBe('db down');
    await service.resetPassword('tok-1', STRONG);
    expect(updates).toHaveLength(1);
  });
});

describe('production defaults', () => {
  it('works without clock or generateToken, producing unguessable tokens', async () => {
    const sent = [];
    const service = createPasswordResetService({
      users: { async findByEmail(e) { return { id: 'u1', email: e }; }, async updatePassword() {} },
      mailer: { async send(m) { sent.push(m); } },
      hashPassword: async (p) => p,
    });
    await service.requestReset('a@example.com');
    await service.requestReset('a@example.com');
    const tokens = sent.map((m) => /token=([A-Za-z0-9_-]+)/.exec(m.text)?.[1]);
    expect(tokens[0]).toBeDefined();
    expect(tokens[0].length).toBeGreaterThanOrEqual(32);
    expect(tokens[0]).not.toBe(tokens[1]);
    await service.resetPassword(tokens[1], STRONG);
  });
});
