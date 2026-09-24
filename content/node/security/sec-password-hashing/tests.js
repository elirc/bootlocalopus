import crypto from 'node:crypto';

// Cheap parameters keep the suite fast; the format is the same at any cost.
const FAST = { N: 1024, r: 8, p: 1 };

const fields = (stored) => stored.split('$');

/** verify() that reports a throw instead of propagating it, so the failure message says what happened. */
const safeVerify = async (password, stored) => {
  try {
    return await solution.verify(password, stored);
  } catch (e) {
    return 'threw ' + (e && e.message);
  }
};

describe('hash', () => {
  it('produces scrypt$N$r$p$salt$key', async () => {
    const stored = await solution.hash('correct horse', FAST);
    expect(typeof stored).toBe('string');
    const f = fields(stored);
    expect(f).toHaveLength(6);
    expect(f.slice(0, 4)).toEqual(['scrypt', '1024', '8', '1']);
    expect(f[4]).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(f[5]).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(f[4], 'base64url')).toHaveLength(16);
    expect(Buffer.from(f[5], 'base64url')).toHaveLength(32);
  });

  it('stores a real scrypt key over the decoded salt bytes', async () => {
    const stored = await solution.hash('correct horse', FAST);
    const f = fields(stored);
    const expected = crypto.scryptSync('correct horse', Buffer.from(f[4], 'base64url'), 32, FAST);
    expect(f[5]).toBe(expected.toString('base64url'));
  });

  it('salts: the same password hashes differently every time', async () => {
    const a = await solution.hash('same', FAST);
    const b = await solution.hash('same', FAST);
    expect(a).not.toBe(b);
    expect(fields(a)[4]).not.toBe(fields(b)[4]);
  });

  it('records the parameters it was given', async () => {
    const stored = await solution.hash('pw', { N: 2048, r: 4, p: 2 });
    expect(fields(stored).slice(0, 4)).toEqual(['scrypt', '2048', '4', '2']);
    const f = fields(stored);
    const expected = crypto.scryptSync('pw', Buffer.from(f[4], 'base64url'), 32, { N: 2048, r: 4, p: 2 });
    expect(f[5]).toBe(expected.toString('base64url'));
  });

  it('uses DEFAULT_PARAMS when none are given', async () => {
    expect(solution.DEFAULT_PARAMS).toEqual({ N: 16384, r: 8, p: 1 });
    const stored = await solution.hash('pw');
    expect(fields(stored).slice(0, 4)).toEqual(['scrypt', '16384', '8', '1']);
  });
});

describe('verify', () => {
  it('accepts the right password and rejects the wrong one', async () => {
    const stored = await solution.hash('correct horse', FAST);
    expect(await safeVerify('correct horse', stored)).toBe(true);
    expect(await safeVerify('correct horsf', stored)).toBe(false);
    expect(await safeVerify('Correct horse', stored)).toBe(false);
    expect(await safeVerify('', stored)).toBe(false);
  });

  it('round-trips unicode passwords', async () => {
    const stored = await solution.hash('pässwörd 🔑', FAST);
    expect(await safeVerify('pässwörd 🔑', stored)).toBe(true);
    expect(await safeVerify('passwort 🔑', stored)).toBe(false);
  });

  it('verifies with the parameters stored in the hash, not the defaults', async () => {
    const stored = await solution.hash('pw', { N: 2048, r: 4, p: 2 });
    expect(await safeVerify('pw', stored)).toBe(true);
  });

  it('verifies a hash made elsewhere in the same format', async () => {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync('legacy', salt, 32, { N: 512, r: 2, p: 1 });
    const stored = ['scrypt', 512, 2, 1, salt.toString('base64url'), key.toString('base64url')].join('$');
    expect(await safeVerify('legacy', stored)).toBe(true);
    expect(await safeVerify('legacz', stored)).toBe(false);
  });

  it('fails when any stored field is tampered with', async () => {
    const stored = await solution.hash('pw', FAST);
    const f = fields(stored);
    const key = Buffer.from(f[5], 'base64url');
    key[31] ^= 1;
    expect(await safeVerify('pw', [...f.slice(0, 5), key.toString('base64url')].join('$'))).toBe(false);
    const salt = Buffer.from(f[4], 'base64url');
    salt[0] ^= 1;
    expect(await safeVerify('pw', [...f.slice(0, 4), salt.toString('base64url'), f[5]].join('$'))).toBe(false);
    expect(await safeVerify('pw', ['scrypt', '2048', '8', '1', f[4], f[5]].join('$'))).toBe(false);
  });

  it('resolves false, never throws, for malformed stored values', async () => {
    const good = fields(await solution.hash('pw', FAST));
    const [, , , , salt, key] = good;
    const bad = [
      null, undefined, 42, {}, '', 'nope', '$$$$$',
      ['bcrypt', '1024', '8', '1', salt, key].join('$'),
      ['scrypt', '1024', '8', '1', salt].join('$'),
      [...good, 'extra'].join('$'),
      ['scrypt', 'abc', '8', '1', salt, key].join('$'),
      ['scrypt', '-1024', '8', '1', salt, key].join('$'),
      ['scrypt', '1024.0', '8', '1', salt, key].join('$'),
      ['scrypt', '1e3', '8', '1', salt, key].join('$'),
      ['scrypt', '0', '8', '1', salt, key].join('$'),
      ['scrypt', '1024', '', '1', salt, key].join('$'),
      ['scrypt', '1024', '8', '1', '', key].join('$'),
      ['scrypt', '1024', '8', '1', salt, ''].join('$'),
      ['scrypt', '1024', '8', '1', crypto.randomBytes(8).toString('base64url'), key].join('$'),
      ['scrypt', '1024', '8', '1', salt, crypto.randomBytes(31).toString('base64url')].join('$'),
      ['scrypt', '1024', '8', '1', salt, crypto.randomBytes(33).toString('base64url')].join('$'),
      ['scrypt', '1024', '8', '1', salt, '!!!!'].join('$'),
    ];
    for (const stored of bad) {
      expect({ stored, result: await safeVerify('pw', stored) }).toEqual({ stored, result: false });
    }
  });

  it('resolves false for parameters scrypt itself refuses', async () => {
    const [, , , , salt, key] = fields(await solution.hash('pw', FAST));
    // Not a power of two.
    expect(await safeVerify('pw', ['scrypt', '1000', '8', '1', salt, key].join('$'))).toBe(false);
    // 128 * N * r bytes = 16 GiB: far past scrypt's memory limit. A hostile row must not take the process down.
    expect(await safeVerify('pw', ['scrypt', String(2 ** 24), '8', '1', salt, key].join('$'))).toBe(false);
  });

  it('resolves false for a non-string password', async () => {
    const stored = await solution.hash('pw', FAST);
    for (const password of [null, undefined, 42, ['pw'], { toString: () => 'pw' }]) {
      expect(await safeVerify(password, stored)).toBe(false);
    }
  });
});

describe('needsRehash', () => {
  it('is false for a hash made with the given params', async () => {
    const stored = await solution.hash('pw', FAST);
    expect(solution.needsRehash(stored, FAST)).toBe(false);
    expect(solution.needsRehash(stored, { N: 1024, r: 8, p: 1 })).toBe(false);
  });

  it('is true when any parameter differs', async () => {
    const stored = await solution.hash('pw', FAST);
    expect(solution.needsRehash(stored, { N: 2048, r: 8, p: 1 })).toBe(true);
    expect(solution.needsRehash(stored, { N: 1024, r: 16, p: 1 })).toBe(true);
    expect(solution.needsRehash(stored, { N: 1024, r: 8, p: 2 })).toBe(true);
  });

  it('compares against DEFAULT_PARAMS by default', async () => {
    const weak = await solution.hash('pw', FAST);
    expect(solution.needsRehash(weak)).toBe(true);
    const salt = crypto.randomBytes(16).toString('base64url');
    const key = crypto.randomBytes(32).toString('base64url');
    expect(solution.needsRehash(['scrypt', '16384', '8', '1', salt, key].join('$'))).toBe(false);
  });

  it('is true for anything it cannot parse', () => {
    for (const stored of [null, undefined, '', 'nope', 'bcrypt$2b$10$abc', 'scrypt$x$8$1$a$b']) {
      expect(solution.needsRehash(stored, FAST)).toBe(true);
    }
  });
});
