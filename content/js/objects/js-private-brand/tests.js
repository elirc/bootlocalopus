import { inspect } from 'node:util';

const { ApiCredential } = solution;
const SECRET = 'sk_live_9f8e7d6c5b4a';
const make = () => new ApiCredential({ id: 'billing', secret: SECRET, scopes: ['read', 'charge'] });

describe('construction', () => {
  it('rejects a missing or empty secret with a TypeError', () => {
    expect(() => new ApiCredential({ id: 'x', secret: '' })).toThrow(TypeError);
    expect(() => new ApiCredential({ id: 'x' })).toThrow(TypeError);
    expect(() => new ApiCredential({ id: 'x', secret: 42 })).toThrow(TypeError);
  });

  it('exposes id and scopes, defaulting scopes to []', () => {
    const cred = make();
    expect(cred.id).toBe('billing');
    expect(cred.scopes).toEqual(['read', 'charge']);
    expect(new ApiCredential({ id: 'y', secret: 's' }).scopes).toEqual([]);
  });
});

describe('the secret stays inside', () => {
  it('is not readable as a property', () => {
    const cred = make();
    expect(cred.secret).toBeUndefined();
    for (const key of Reflect.ownKeys(cred)) {
      const d = Object.getOwnPropertyDescriptor(cred, key);
      expect(String(d.value)).not.toContain(SECRET);
    }
  });

  it('does not appear in JSON, keys or a spread copy', () => {
    const cred = make();
    const json = JSON.stringify({ client: cred });
    expect(json).not.toContain(SECRET);
    expect(JSON.parse(json).client).toEqual({ id: 'billing', scopes: ['read', 'charge'], secret: '[redacted]' });
    expect(JSON.stringify({ ...cred })).not.toContain(SECRET);
    expect(Object.values(cred).join(',')).not.toContain(SECRET);
  });

  it('does not appear in util.inspect, even nested', () => {
    const cred = make();
    expect(inspect(cred)).toBe("ApiCredential { id: 'billing', secret: [redacted] }");
    const nested = inspect({ err: new Error('boom'), client: cred }, { depth: 5 });
    expect(nested).not.toContain(SECRET);
    expect(nested).toContain('billing');
  });

  it('is safe in a template literal', () => {
    expect(`${make()}`).toBe('ApiCredential(billing)');
  });
});

describe('behaviour', () => {
  it('authorize returns new headers with the bearer token', () => {
    const cred = make();
    const headers = { accept: 'application/json' };
    const out = cred.authorize(headers);
    expect(out).toEqual({ accept: 'application/json', authorization: `Bearer ${SECRET}` });
    expect(out).not.toBe(headers);
    expect(headers).toEqual({ accept: 'application/json' });
    expect(cred.authorize()).toEqual({ authorization: `Bearer ${SECRET}` });
  });

  it('can() checks scopes, and the scopes array cannot be used to grant one', () => {
    const cred = make();
    expect(cred.can('read')).toBe(true);
    expect(cred.can('admin')).toBe(false);
    try { cred.scopes.push('admin'); } catch { /* a frozen array is fine too */ }
    expect(cred.can('admin')).toBe(false);
    expect(cred.scopes).toEqual(['read', 'charge']);
  });

  it('copies the scopes it was given', () => {
    const scopes = ['read'];
    const cred = new ApiCredential({ id: 'z', secret: 's', scopes });
    scopes.push('admin');
    expect(cred.can('admin')).toBe(false);
  });
});

describe('brand check', () => {
  it('is true for real instances', () => {
    expect(ApiCredential.isCredential(make())).toBe(true);
  });

  it('is false for lookalikes that instanceof would accept', () => {
    const fake = Object.create(ApiCredential.prototype);
    expect(fake instanceof ApiCredential).toBe(true); // why instanceof is not enough
    expect(ApiCredential.isCredential(fake)).toBe(false);
    expect(ApiCredential.isCredential({ id: 'billing', scopes: [], authorize() {} })).toBe(false);
  });

  it('is false, without throwing, for primitives and null', () => {
    for (const v of [null, undefined, 42, 'sk_live', true, Symbol('x')]) {
      expect(ApiCredential.isCredential(v)).toBe(false);
    }
  });

  it('methods refuse to run on something that is not a real instance', () => {
    expect(() => ApiCredential.prototype.authorize.call({})).toThrow(TypeError);
    expect(() => ApiCredential.prototype.can.call(Object.create(ApiCredential.prototype), 'read')).toThrow(TypeError);
  });
});
