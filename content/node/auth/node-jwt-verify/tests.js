import crypto from 'node:crypto';

const SECRET = 'k'.repeat(40);
const NOW_MS = 1_700_000_000_000;
const NOW = NOW_MS / 1000;

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const hmac = (data, secret = SECRET, alg = 'sha256') => crypto.createHmac(alg, secret).update(data).digest('base64url');

const make = (payload, { header = { alg: 'HS256', typ: 'JWT' }, secret = SECRET, alg = 'sha256' } = {}) => {
  const h = b64(header);
  const p = b64(payload);
  return `${h}.${p}.${hmac(`${h}.${p}`, secret, alg)}`;
};

const base = { sub: 'u1', iss: 'https://auth.example', aud: 'orders-api', exp: NOW + 600 };
const opts = { secret: SECRET, issuer: 'https://auth.example', audience: 'orders-api', now: () => NOW_MS };

const codeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof solution.JwtError)) return 'not a JwtError: ' + (e && e.name) + ' ' + (e && e.message);
    return e.code;
  }
  return 'did not throw';
};
const verifyCode = (token, o = opts) => codeOf(() => solution.verifyJwt(token, o));

describe('JwtError', () => {
  it('carries its code', () => {
    const e = new solution.JwtError('expired');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('JwtError');
    expect(e.code).toBe('expired');
    expect(e.message).toBe('expired');
  });
});

describe('a valid token', () => {
  it('returns the payload', () => {
    expect(solution.verifyJwt(make(base), opts)).toEqual(base);
  });

  it('accepts an audience array containing the audience', () => {
    const payload = { ...base, aud: ['billing-api', 'orders-api'] };
    expect(solution.verifyJwt(make(payload), opts)).toEqual(payload);
  });

  it('skips issuer and audience checks when they are not configured', () => {
    const payload = { sub: 'u1', exp: NOW + 5 };
    expect(solution.verifyJwt(make(payload), { secret: SECRET, now: () => NOW_MS })).toEqual(payload);
  });
});

describe('shape', () => {
  it('rejects things that are not three base64url segments', () => {
    const good = make(base);
    const [h, p, s] = good.split('.');
    for (const t of [undefined, 42, '', 'abc', `${h}.${p}`, `${h}.${p}.${s}.x`, `${h}..${s}`, `${h}.${p}.`, `${h}.${p}.${s}=`, `${h}.${p}.${s.slice(0, -2)}+/`, ` ${good}`]) {
      expect(verifyCode(t)).toBe('malformed');
    }
  });

  it('rejects a header that is not a JSON object', () => {
    for (const header of ['not json', '[1,2]', 'null', '"HS256"']) {
      const h = b64(header);
      const p = b64(base);
      expect(verifyCode(`${h}.${p}.${hmac(`${h}.${p}`)}`)).toBe('malformed');
    }
  });
});

describe('algorithm', () => {
  it('rejects alg none, even with a well-formed empty-ish signature', () => {
    const h = b64({ alg: 'none', typ: 'JWT' });
    const p = b64(base);
    expect(verifyCode(`${h}.${p}.`)).toBe('malformed');
    expect(verifyCode(`${h}.${p}.AAAA`)).toBe('unsupported-alg');
    expect(verifyCode(`${h}.${p}.${hmac(`${h}.${p}`)}`)).toBe('unsupported-alg');
  });

  it('rejects every algorithm but exactly HS256, even when correctly signed', () => {
    expect(verifyCode(make(base, { header: { alg: 'HS512' }, alg: 'sha512' }))).toBe('unsupported-alg');
    for (const alg of ['RS256', 'hs256', 'HS256 ', 'None', '', null]) {
      expect(verifyCode(make(base, { header: { alg } }))).toBe('unsupported-alg');
    }
    expect(verifyCode(make(base, { header: { typ: 'JWT' } }))).toBe('unsupported-alg');
  });
});

describe('signature', () => {
  it('rejects a token signed with another secret', () => {
    expect(verifyCode(make(base, { secret: 'x'.repeat(40) }))).toBe('bad-signature');
  });

  it('rejects a tampered payload', () => {
    const [h, , s] = make(base).split('.');
    const p = b64({ ...base, sub: 'admin' });
    expect(verifyCode(`${h}.${p}.${s}`)).toBe('bad-signature');
  });

  it('rejects a truncated or extended signature without throwing a RangeError', () => {
    const t = make(base);
    expect(verifyCode(t.slice(0, -1))).toBe('bad-signature');
    expect(verifyCode(t + 'A')).toBe('bad-signature');
  });

  it('checks the signature before reading the payload', () => {
    // An expired, unsigned payload must say bad-signature, not leak that it is expired.
    const [h] = make(base).split('.');
    const p = b64({ ...base, exp: NOW - 10 });
    expect(verifyCode(`${h}.${p}.${hmac('something else')}`)).toBe('bad-signature');
    const junk = b64('not json at all');
    expect(verifyCode(`${h}.${junk}.${hmac('x')}`)).toBe('bad-signature');
  });

  it('signs over the exact segments received', () => {
    // Same JSON, different whitespace: a different token, and its own valid signature.
    const h = b64('{"alg":"HS256"}');
    const p = b64(`{ "sub": "u1", "aud": "orders-api", "iss": "https://auth.example", "exp": ${NOW + 60} }`);
    expect(solution.verifyJwt(`${h}.${p}.${hmac(`${h}.${p}`)}`, opts).sub).toBe('u1');
  });
});

describe('payload', () => {
  it('must be a JSON object with a numeric exp', () => {
    for (const payload of ['[1]', 'null', '"hi"', '7']) {
      const h = b64({ alg: 'HS256' });
      const p = b64(payload);
      expect(verifyCode(`${h}.${p}.${hmac(`${h}.${p}`)}`)).toBe('malformed');
    }
    const { exp, ...noExp } = base;
    expect(verifyCode(make(noExp))).toBe('malformed');
    expect(verifyCode(make({ ...base, exp: String(NOW + 600) }))).toBe('malformed');
    expect(verifyCode(make({ ...base, nbf: 'soon' }))).toBe('malformed');
  });
});

describe('time', () => {
  it('compares exp in seconds', () => {
    expect(verifyCode(make({ ...base, exp: NOW - 1 }))).toBe('expired');
    expect(verifyCode(make({ ...base, exp: NOW }))).toBe('expired');
    expect(solution.verifyJwt(make({ ...base, exp: NOW + 1 }), opts).sub).toBe('u1');
    // A millisecond exp is far in the future — a real token never has one, but it is not expired.
    expect(solution.verifyJwt(make({ ...base, exp: NOW_MS }), opts).sub).toBe('u1');
  });

  it('expires exactly one second later, not before', () => {
    const at = (ms) => ({ ...opts, now: () => ms });
    expect(verifyCode(make({ ...base, exp: NOW + 1 }), at(NOW_MS + 999))).toBe('did not throw');
    expect(verifyCode(make({ ...base, exp: NOW + 1 }), at(NOW_MS + 1000))).toBe('expired');
  });

  it('applies leeway to exp', () => {
    const t = make({ ...base, exp: NOW - 20 });
    expect(verifyCode(t, { ...opts, leewaySec: 30 })).toBe('did not throw');
    expect(verifyCode(t, { ...opts, leewaySec: 20 })).toBe('expired');
  });

  it('honours nbf, with leeway', () => {
    expect(verifyCode(make({ ...base, nbf: NOW + 10 }))).toBe('not-yet-valid');
    expect(verifyCode(make({ ...base, nbf: NOW }))).toBe('did not throw');
    expect(verifyCode(make({ ...base, nbf: NOW + 10 }), { ...opts, leewaySec: 10 })).toBe('did not throw');
    expect(verifyCode(make({ ...base, nbf: NOW + 10 }), { ...opts, leewaySec: 9 })).toBe('not-yet-valid');
  });

  it('reports expired before not-yet-valid', () => {
    expect(verifyCode(make({ ...base, exp: NOW - 1, nbf: NOW + 5 }))).toBe('expired');
  });
});

describe('issuer and audience', () => {
  it('requires the exact issuer', () => {
    expect(verifyCode(make({ ...base, iss: 'https://auth.example.evil' }))).toBe('bad-issuer');
    const { iss, ...noIss } = base;
    expect(verifyCode(make(noIss))).toBe('bad-issuer');
  });

  it('requires the exact audience, not a substring', () => {
    expect(verifyCode(make({ ...base, aud: 'orders-api-internal' }))).toBe('bad-audience');
    expect(verifyCode(make({ ...base, aud: 'orders' }))).toBe('bad-audience');
    expect(verifyCode(make({ ...base, aud: ['billing-api'] }))).toBe('bad-audience');
    expect(verifyCode(make({ ...base, aud: ['orders-api-internal'] }))).toBe('bad-audience');
    expect(verifyCode(make({ ...base, aud: [['orders-api']] }))).toBe('bad-audience');
    expect(verifyCode(make({ ...base, aud: [] }))).toBe('bad-audience');
    const { aud, ...noAud } = base;
    expect(verifyCode(make(noAud))).toBe('bad-audience');
  });

  it('checks issuer before audience', () => {
    expect(verifyCode(make({ ...base, iss: 'x', aud: 'y' }))).toBe('bad-issuer');
  });
});
