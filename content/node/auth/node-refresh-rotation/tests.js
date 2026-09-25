const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

const setup = (opts = {}) => {
  const clock = { t: 1_700_000_000_000 };
  const svc = solution.createTokenService({ now: () => clock.t, ...opts });
  return { svc, clock };
};

const codeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    return e instanceof solution.RefreshError ? e.code : 'not a RefreshError: ' + (e && e.message);
  }
  return 'did not throw';
};

describe('RefreshError', () => {
  it('carries its code', () => {
    const e = new solution.RefreshError('expired');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('RefreshError');
    expect(e.code).toBe('expired');
    expect(e.message).toBe('expired');
  });
});

describe('login and authenticate', () => {
  it('issues two distinct random tokens', () => {
    const { svc } = setup();
    const a = svc.login('u1');
    const b = svc.login('u1');
    expect(a.accessToken).toMatch(TOKEN);
    expect(a.refreshToken).toMatch(TOKEN);
    expect(new Set([a.accessToken, a.refreshToken, b.accessToken, b.refreshToken]).size).toBe(4);
    expect(svc.authenticate(a.accessToken)).toEqual({ userId: 'u1' });
  });

  it('does not accept a refresh token as an access token or vice versa', () => {
    const { svc } = setup();
    const { accessToken, refreshToken } = svc.login('u1');
    expect(svc.authenticate(refreshToken)).toBeNull();
    expect(codeOf(() => svc.refresh(accessToken))).toBe('invalid');
  });

  it('expires access tokens at exactly accessTtlMs', () => {
    const { svc, clock } = setup({ accessTtlMs: 15 * MIN });
    const { accessToken } = svc.login('u1');
    clock.t += 15 * MIN - 1;
    expect(svc.authenticate(accessToken)).toEqual({ userId: 'u1' });
    clock.t += 1;
    expect(svc.authenticate(accessToken)).toBeNull();
  });

  it('rejects junk', () => {
    const { svc } = setup();
    svc.login('u1');
    for (const t of [undefined, null, 42, '', 'nope', '__proto__', 'constructor']) {
      expect(svc.authenticate(t)).toBeNull();
      expect(codeOf(() => svc.refresh(t))).toBe('invalid');
      expect(svc.logout(t)).toBe(false);
    }
  });
});

describe('refresh', () => {
  it('rotates: a new pair, and the old access token keeps working until it expires', () => {
    const { svc } = setup();
    const first = svc.login('u1');
    const second = svc.refresh(first.refreshToken);
    expect(second.refreshToken).toMatch(TOKEN);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(svc.authenticate(second.accessToken)).toEqual({ userId: 'u1' });
    expect(svc.authenticate(first.accessToken)).toEqual({ userId: 'u1' });
    const third = svc.refresh(second.refreshToken);
    expect(svc.authenticate(third.accessToken)).toEqual({ userId: 'u1' });
  });

  it('detects reuse and revokes the whole family, including the newest tokens', () => {
    const { svc } = setup();
    const first = svc.login('u1');
    const second = svc.refresh(first.refreshToken); // the attacker, with a stolen copy
    expect(codeOf(() => svc.refresh(first.refreshToken))).toBe('reuse-detected'); // the real user
    expect(svc.authenticate(second.accessToken)).toBeNull();
    expect(svc.authenticate(first.accessToken)).toBeNull();
    expect(codeOf(() => svc.refresh(second.refreshToken))).toBe('invalid');
    // Revoked is revoked: presenting the reused token again is simply invalid.
    expect(codeOf(() => svc.refresh(first.refreshToken))).toBe('invalid');
  });

  it('detects reuse of a token several generations back', () => {
    const { svc } = setup();
    const t1 = svc.login('u1');
    const t2 = svc.refresh(t1.refreshToken);
    const t3 = svc.refresh(t2.refreshToken);
    const t4 = svc.refresh(t3.refreshToken);
    expect(codeOf(() => svc.refresh(t2.refreshToken))).toBe('reuse-detected');
    expect(svc.authenticate(t4.accessToken)).toBeNull();
    expect(codeOf(() => svc.refresh(t4.refreshToken))).toBe('invalid');
  });

  it('leaves other families of the same user alone', () => {
    const { svc } = setup();
    const laptop = svc.login('u1');
    const phone = svc.login('u1');
    const other = svc.login('u2');
    svc.refresh(laptop.refreshToken);
    expect(codeOf(() => svc.refresh(laptop.refreshToken))).toBe('reuse-detected');
    expect(svc.authenticate(phone.accessToken)).toEqual({ userId: 'u1' });
    expect(svc.authenticate(other.accessToken)).toEqual({ userId: 'u2' });
    expect(codeOf(() => svc.refresh(phone.refreshToken))).toBe('did not throw');
  });

  it('expires a refresh token refreshTtlMs after it was issued', () => {
    const { svc, clock } = setup({ refreshTtlMs: 7 * DAY });
    const a = svc.login('u1');
    const b = svc.login('u1');
    clock.t += 7 * DAY - 1;
    const a2 = svc.refresh(a.refreshToken);
    clock.t += 1;
    expect(codeOf(() => svc.refresh(b.refreshToken))).toBe('expired');
    // a2 was issued a millisecond ago, so it is fine.
    expect(codeOf(() => svc.refresh(a2.refreshToken))).toBe('did not throw');
  });

  it('does not let rotation extend the family past familyTtlMs', () => {
    const { svc, clock } = setup({ refreshTtlMs: 2 * DAY, familyTtlMs: 5 * DAY });
    let pair = svc.login('u1');
    for (let i = 0; i < 4; i++) {
      clock.t += DAY;
      pair = svc.refresh(pair.refreshToken);
    }
    clock.t += DAY - 1;
    pair = svc.refresh(pair.refreshToken);
    clock.t += 1; // exactly five days after login
    expect(codeOf(() => svc.refresh(pair.refreshToken))).toBe('expired');
  });

  it('checks for reuse before expiry', () => {
    const { svc, clock } = setup({ refreshTtlMs: DAY });
    const first = svc.login('u1');
    svc.refresh(first.refreshToken);
    clock.t += 2 * DAY;
    expect(codeOf(() => svc.refresh(first.refreshToken))).toBe('reuse-detected');
  });
});

describe('logout and revokeAllForUser', () => {
  it('logout revokes the family, whichever of its tokens is presented', () => {
    const { svc } = setup();
    const first = svc.login('u1');
    const second = svc.refresh(first.refreshToken);
    expect(svc.logout(first.refreshToken)).toBe(true);
    expect(svc.authenticate(second.accessToken)).toBeNull();
    expect(codeOf(() => svc.refresh(second.refreshToken))).toBe('invalid');
    expect(svc.logout(second.refreshToken)).toBe(false);
  });

  it('revokeAllForUser counts and kills every unrevoked family of that user only', () => {
    const { svc } = setup();
    const a = svc.login('u1');
    const b = svc.login('u1');
    const c = svc.login('u1');
    const d = svc.login('u2');
    svc.logout(c.refreshToken);
    expect(svc.revokeAllForUser('u1')).toBe(2);
    expect(svc.revokeAllForUser('u1')).toBe(0);
    expect(svc.authenticate(a.accessToken)).toBeNull();
    expect(codeOf(() => svc.refresh(b.refreshToken))).toBe('invalid');
    expect(svc.authenticate(d.accessToken)).toEqual({ userId: 'u2' });
    expect(svc.revokeAllForUser('nobody')).toBe(0);
    // A fresh login afterwards works normally.
    const e = svc.login('u1');
    expect(svc.authenticate(e.accessToken)).toEqual({ userId: 'u1' });
  });
});
