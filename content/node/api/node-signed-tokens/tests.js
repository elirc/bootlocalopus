import crypto from 'node:crypto';

const secret = 'a-very-secret-key';

describe('sign', () => {
  it('produces two base64url segments', () => {
    const { sign } = solution.createTokens({ secret });
    const token = sign({ userId: 7 });
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
    expect(token).not.toContain('=');
  });

  it('embeds the payload readably (signed, not encrypted)', () => {
    const { sign } = solution.createTokens({ secret });
    const token = sign({ userId: 7, role: 'admin' });
    const decoded = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    expect(decoded.userId).toBe(7);
    expect(decoded.role).toBe('admin');
  });

  it('adds an expiry from now + ttl', () => {
    const { sign } = solution.createTokens({ secret, ttlMs: 5000, now: () => 1_000_000 });
    const token = sign({ userId: 1 });
    const decoded = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    expect(decoded.exp).toBe(1_005_000);
  });
});

describe('verify', () => {
  it('round-trips a payload', () => {
    const { sign, verify } = solution.createTokens({ secret });
    const payload = verify(sign({ userId: 7, role: 'admin' }));
    expect(payload.userId).toBe(7);
    expect(payload.role).toBe('admin');
  });

  it('rejects a token signed with a different secret', () => {
    const mint = solution.createTokens({ secret: 'attacker-key' });
    const check = solution.createTokens({ secret });
    expect(() => check.verify(mint.sign({ userId: 1 }))).toThrow('bad signature');
  });

  it('rejects a tampered payload', () => {
    const { sign, verify } = solution.createTokens({ secret });
    const token = sign({ userId: 7, role: 'user' });
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ userId: 7, role: 'admin', exp: Date.now() + 10000 }))
      .toString('base64url');
    expect(() => verify(forged + '.' + sig)).toThrow('bad signature');
  });

  it('rejects a truncated signature', () => {
    const { sign, verify } = solution.createTokens({ secret });
    const token = sign({ userId: 1 });
    const [body, sig] = token.split('.');
    expect(() => verify(body + '.' + sig.slice(0, -4))).toThrow('bad signature');
  });

  it('rejects malformed tokens', () => {
    const { verify } = solution.createTokens({ secret });
    for (const bad of ['', 'nodot', 'a.b.c', '.sig', 'body.', 'undefined']) {
      expect(() => verify(bad)).toThrow();
    }
  });

  it('rejects a non-string', () => {
    const { verify } = solution.createTokens({ secret });
    expect(() => verify(null)).toThrow('invalid token');
    expect(() => verify(undefined)).toThrow('invalid token');
  });

  it('rejects a payload that is valid base64 but not JSON', () => {
    const { verify } = solution.createTokens({ secret });
    const body = Buffer.from('not json at all').toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    expect(() => verify(body + '.' + sig)).toThrow('invalid token');
  });

  it('rejects an expired token', () => {
    let clock = 1_000_000;
    const { sign, verify } = solution.createTokens({ secret, ttlMs: 1000, now: () => clock });
    const token = sign({ userId: 1 });
    expect(verify(token).userId).toBe(1);
    clock += 1001;
    expect(() => verify(token)).toThrow('token expired');
  });

  it('treats the exact expiry moment as expired', () => {
    let clock = 1_000_000;
    const { sign, verify } = solution.createTokens({ secret, ttlMs: 1000, now: () => clock });
    const token = sign({ userId: 1 });
    clock += 1000;
    expect(() => verify(token)).toThrow('token expired');
  });

  it('checks the signature before the expiry', () => {
    // An expired token with a bad signature must report the signature problem:
    // you cannot trust exp until you know the payload is authentic.
    let clock = 1_000_000;
    const mint = solution.createTokens({ secret: 'wrong', ttlMs: 10, now: () => clock });
    const check = solution.createTokens({ secret, ttlMs: 10, now: () => clock });
    const token = mint.sign({ userId: 1 });
    clock += 1000;
    expect(() => check.verify(token)).toThrow('bad signature');
  });

  it('uses a timing-safe comparison', () => {
    const original = crypto.timingSafeEqual;
    let used = 0;
    crypto.timingSafeEqual = (...args) => { used++; return original(...args); };
    try {
      const { sign, verify } = solution.createTokens({ secret });
      verify(sign({ userId: 1 }));
    } finally {
      crypto.timingSafeEqual = original;
    }
    expect(used).toBeGreaterThan(0);
  });
});