const APP = 'spa';
const CB = 'https://app.example/callback';

const setup = (opts = {}) => {
  const clock = { t: 1_700_000_000_000 };
  const server = solution.createAuthServer({
    clients: { spa: { redirectUris: [CB, 'http://localhost:5173/callback'] }, other: { redirectUris: ['https://other.example/cb'] } },
    now: () => clock.t,
    ...opts,
  });
  const start = (verifier = solution.createVerifier(), extra = {}) => {
    const code = server.authorize({
      clientId: APP, redirectUri: CB, codeChallenge: solution.challengeFor(verifier), codeChallengeMethod: 'S256', userId: 'u1', ...extra,
    });
    return { code, verifier };
  };
  return { server, clock, start };
};

const errorOf = (fn) => {
  try {
    fn();
  } catch (e) {
    return e instanceof solution.OAuthError ? e.error : 'not an OAuthError: ' + e;
  }
  return 'did not throw';
};

describe('client helpers', () => {
  it('createVerifier returns 43 fresh base64url characters', () => {
    const a = solution.createVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(solution.createVerifier()).not.toBe(a);
  });

  it('challengeFor matches the RFC 7636 example', () => {
    expect(solution.challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('OAuthError carries the error string', () => {
    const e = new solution.OAuthError('invalid_grant');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('OAuthError');
    expect(e.error).toBe('invalid_grant');
    expect(e.message).toBe('invalid_grant');
  });
});

describe('authorize', () => {
  it('issues distinct random codes', () => {
    const { start } = setup();
    const a = start().code;
    const b = start().code;
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('rejects unknown clients, including prototype names', () => {
    const { server } = setup();
    for (const clientId of ['nope', 'constructor', '__proto__', undefined]) {
      expect(errorOf(() => server.authorize({ clientId, redirectUri: CB, codeChallenge: 'a'.repeat(43), codeChallengeMethod: 'S256', userId: 'u1' }))).toBe('invalid_client');
    }
  });

  it('matches redirect URIs exactly', () => {
    const { start } = setup();
    for (const redirectUri of [CB + '/', CB + '?next=x', CB + '/../evil', 'https://app.example/callback.evil.com', 'HTTPS://app.example/callback', 'https://other.example/cb', undefined]) {
      expect(errorOf(() => start(undefined, { redirectUri }))).toBe('invalid_request');
    }
    expect(errorOf(() => start(undefined, { redirectUri: 'http://localhost:5173/callback' }))).toBe('did not throw');
  });

  it('requires S256 and a well-formed challenge', () => {
    const { server } = setup();
    const v = solution.createVerifier();
    const base = { clientId: APP, redirectUri: CB, userId: 'u1' };
    expect(errorOf(() => server.authorize({ ...base, codeChallenge: v, codeChallengeMethod: 'plain' }))).toBe('invalid_request');
    expect(errorOf(() => server.authorize({ ...base, codeChallenge: solution.challengeFor(v) }))).toBe('invalid_request');
    expect(errorOf(() => server.authorize({ ...base, codeChallenge: solution.challengeFor(v), codeChallengeMethod: 's256' }))).toBe('invalid_request');
    for (const codeChallenge of ['short', 'a'.repeat(44), 'a'.repeat(42) + '=', 'a'.repeat(42) + '+', undefined]) {
      expect(errorOf(() => server.authorize({ ...base, codeChallenge, codeChallengeMethod: 'S256' }))).toBe('invalid_request');
    }
  });
});

describe('exchange', () => {
  it('trades a code and its verifier for a token', () => {
    const { server, start } = setup();
    const { code, verifier } = start();
    const out = server.exchange({ code, clientId: APP, redirectUri: CB, codeVerifier: verifier });
    expect(out.userId).toBe('u1');
    expect(out.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(out.accessToken).not.toBe(code);
    expect(server.introspect(out.accessToken)).toEqual({ active: true, userId: 'u1', clientId: APP });
  });

  it('accepts any valid verifier alphabet and length', () => {
    const { server, start } = setup();
    for (const verifier of ['a'.repeat(43), 'Az09-._~'.repeat(16)]) {
      const { code } = start(verifier);
      expect(server.exchange({ code, clientId: APP, redirectUri: CB, codeVerifier: verifier }).userId).toBe('u1');
    }
  });

  it('rejects a malformed verifier without consuming the code', () => {
    const { server, start } = setup();
    const { code, verifier } = start();
    for (const codeVerifier of ['a'.repeat(42), 'a'.repeat(129), verifier.slice(0, 42) + '+', verifier.slice(0, 42) + ' ', undefined]) {
      expect(errorOf(() => server.exchange({ code, clientId: APP, redirectUri: CB, codeVerifier }))).toBe('invalid_request');
    }
    expect(server.exchange({ code, clientId: APP, redirectUri: CB, codeVerifier: verifier }).userId).toBe('u1');
  });

  it('rejects the wrong verifier, and the code is then spent', () => {
    const { server, start } = setup();
    const { code, verifier } = start();
    expect(errorOf(() => server.exchange({ code, clientId: APP, redirectUri: CB, codeVerifier: solution.createVerifier() }))).toBe('invalid_grant');
    expect(errorOf(() => server.exchange({ code, clientId: APP, redirectUri: CB, codeVerifier: verifier }))).toBe('invalid_grant');
  });

  it('does not accept the challenge itself as the verifier (no plain fallback)', () => {
    const { server, start } = setup();
    const { code, verifier } = start();
    expect(errorOf(() => server.exchange({ code, clientId: APP, redirectUri: CB, codeVerifier: solution.challengeFor(verifier) }))).toBe('invalid_grant');
  });

  it('binds the code to its client and redirect URI', () => {
    const { server, start } = setup();
    const a = start();
    expect(errorOf(() => server.exchange({ code: a.code, clientId: 'other', redirectUri: CB, codeVerifier: a.verifier }))).toBe('invalid_grant');
    const b = start();
    expect(errorOf(() => server.exchange({ code: b.code, clientId: APP, redirectUri: 'http://localhost:5173/callback', codeVerifier: b.verifier }))).toBe('invalid_grant');
    expect(errorOf(() => server.exchange({ code: b.code, clientId: APP, redirectUri: CB, codeVerifier: b.verifier }))).toBe('invalid_grant');
  });

  it('rejects unknown codes', () => {
    const { server } = setup();
    for (const code of ['nope', undefined, '__proto__']) {
      expect(errorOf(() => server.exchange({ code, clientId: APP, redirectUri: CB, codeVerifier: 'a'.repeat(43) }))).toBe('invalid_grant');
    }
  });

  it('expires codes at exactly codeTtlMs', () => {
    const { server, start, clock } = setup({ codeTtlMs: 30_000 });
    const a = start();
    const b = start();
    clock.t += 29_999;
    expect(server.exchange({ code: a.code, clientId: APP, redirectUri: CB, codeVerifier: a.verifier }).userId).toBe('u1');
    clock.t += 1;
    expect(errorOf(() => server.exchange({ code: b.code, clientId: APP, redirectUri: CB, codeVerifier: b.verifier }))).toBe('invalid_grant');
  });

  it('revokes the issued token when a code is replayed', () => {
    const { server, start } = setup();
    const { code, verifier } = start();
    const other = start();
    const { accessToken } = server.exchange({ code, clientId: APP, redirectUri: CB, codeVerifier: verifier });
    const keep = server.exchange({ code: other.code, clientId: APP, redirectUri: CB, codeVerifier: other.verifier }).accessToken;
    expect(errorOf(() => server.exchange({ code, clientId: APP, redirectUri: CB, codeVerifier: verifier }))).toBe('invalid_grant');
    expect(server.introspect(accessToken)).toEqual({ active: false });
    expect(server.introspect(keep).active).toBe(true);
  });

  it('treats a replay with a malformed verifier as a malformed request', () => {
    const { server, start } = setup();
    const { code, verifier } = start();
    const { accessToken } = server.exchange({ code, clientId: APP, redirectUri: CB, codeVerifier: verifier });
    expect(errorOf(() => server.exchange({ code, clientId: APP, redirectUri: CB, codeVerifier: 'x' }))).toBe('invalid_request');
    expect(server.introspect(accessToken).active).toBe(true);
  });
});

describe('introspect', () => {
  it('says inactive for anything unknown', () => {
    const { server } = setup();
    for (const t of ['nope', undefined, '', 'constructor']) expect(server.introspect(t)).toEqual({ active: false });
  });
});
