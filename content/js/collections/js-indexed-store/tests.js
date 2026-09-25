const { Store, ConstraintError } = solution;

const ids = (rows) => rows.map((r) => r.id);

function users() {
  const s = new Store({ indexes: ['team', 'role'], unique: ['email'] });
  s.insertMany([
    { id: 1, email: 'ana@x.io', team: 'web', role: 'dev', age: 31 },
    { id: 2, email: 'ben@x.io', team: 'api', role: 'dev', age: 25 },
    { id: 3, email: 'cy@x.io', team: 'web', role: 'lead', age: 40 },
    { id: 4, email: 'di@x.io', team: 'web', role: 'dev', age: null },
    { id: 5, email: 'ed@x.io', team: 'api', role: 'lead', age: 25 },
  ]);
  return s;
}

function expectConstraint(fn, field, value) {
  let caught;
  try { fn(); } catch (e) { caught = e; }
  expect(caught).toBeInstanceOf(ConstraintError);
  expect(caught).toBeInstanceOf(Error);
  expect(caught.name).toBe('ConstraintError');
  expect(caught.field).toBe(field);
  expect(caught.value).toBe(value);
}

describe('insert and get', () => {
  it('stores a frozen copy that the caller cannot corrupt', () => {
    const s = new Store({ indexes: ['team'] });
    const input = { id: 'u1', team: 'web' };
    const stored = s.insert(input);
    expect(stored).not.toBe(input);
    expect(stored).toEqual(input);
    expect(Object.isFrozen(stored)).toBe(true);
    input.team = 'api';
    expect(s.get('u1').team).toBe('web');
    expect(ids(s.findBy('team', 'web'))).toEqual(['u1']);
    expect(s.findBy('team', 'api')).toEqual([]);
    expect(s.size).toBe(1);
  });

  it('uses a custom primary key field', () => {
    const s = new Store({ key: 'sku' });
    s.insert({ sku: 'A-1', price: 5 });
    expect(s.get('A-1').price).toBe(5);
    expect(s.get('A-2')).toBeUndefined();
    expectConstraint(() => s.insert({ sku: 'A-1', price: 6 }), 'sku', 'A-1');
  });

  it('rejects a duplicate primary key', () => {
    const s = users();
    expectConstraint(() => s.insert({ id: 3, email: 'new@x.io', team: 'web' }), 'id', 3);
    expect(s.size).toBe(5);
    expect(s.get(3).email).toBe('cy@x.io');
  });

  it('rejects a taken unique value and changes nothing', () => {
    const s = users();
    expectConstraint(() => s.insert({ id: 9, email: 'ben@x.io', team: 'ops' }), 'email', 'ben@x.io');
    expect(s.size).toBe(5);
    expect(s.get(9)).toBeUndefined();
    expect(s.findBy('team', 'ops')).toEqual([]);
    expect(ids(s.findBy('email', 'ben@x.io'))).toEqual([2]);
  });

  it('lets null and undefined repeat in a unique field', () => {
    const s = new Store({ unique: ['email'] });
    s.insert({ id: 1, email: null });
    s.insert({ id: 2, email: null });
    s.insert({ id: 3 });
    s.insert({ id: 4 });
    expect(s.size).toBe(4);
  });
});

describe('findBy', () => {
  it('returns matches in insertion order', () => {
    const s = users();
    expect(ids(s.findBy('team', 'web'))).toEqual([1, 3, 4]);
    expect(ids(s.findBy('role', 'lead'))).toEqual([3, 5]);
    expect(s.findBy('team', 'nope')).toEqual([]);
  });

  it('works on the primary key and on unique fields', () => {
    const s = users();
    expect(ids(s.findBy('id', 2))).toEqual([2]);
    expect(s.findBy('id', 99)).toEqual([]);
    expect(ids(s.findBy('email', 'cy@x.io'))).toEqual([3]);
  });

  it('throws for a field without an index', () => {
    expect(() => users().findBy('age', 25)).toThrow(/no index/);
  });

  it('compares values like a Map', () => {
    const s = new Store({ indexes: ['v'] });
    s.insertMany([{ id: 1, v: 1 }, { id: 2, v: '1' }, { id: 3, v: NaN }]);
    expect(ids(s.findBy('v', 1))).toEqual([1]);
    expect(ids(s.findBy('v', '1'))).toEqual([2]);
    expect(ids(s.findBy('v', NaN))).toEqual([3]);
  });
});

describe('update', () => {
  it('moves the record between index buckets', () => {
    const s = users();
    const updated = s.update(1, { team: 'api' });
    expect(updated).toEqual({ id: 1, email: 'ana@x.io', team: 'api', role: 'dev', age: 31 });
    expect(Object.isFrozen(updated)).toBe(true);
    expect(s.get(1)).toEqual(updated);
    expect(ids(s.findBy('team', 'web'))).toEqual([3, 4]);
    expect(ids(s.findBy('team', 'api'))).toEqual([1, 2, 5]);
  });

  it('keeps the record\'s place in insertion order', () => {
    const s = users();
    s.update(1, { team: 'api' });
    s.update(1, { team: 'web' });
    expect(ids(s.findBy('team', 'web'))).toEqual([1, 3, 4]);
    expect(ids(s.query())).toEqual([1, 2, 3, 4, 5]);
  });

  it('frees the old unique value and takes the new one', () => {
    const s = users();
    s.update(2, { email: 'benjamin@x.io' });
    expect(s.findBy('email', 'ben@x.io')).toEqual([]);
    s.insert({ id: 6, email: 'ben@x.io', team: 'ops' });
    expect(ids(s.findBy('email', 'ben@x.io'))).toEqual([6]);
    expectConstraint(() => s.insert({ id: 7, email: 'benjamin@x.io' }), 'email', 'benjamin@x.io');
  });

  it('allows a record to keep its own unique value', () => {
    const s = users();
    expect(s.update(3, { email: 'cy@x.io', role: 'dev' }).role).toBe('dev');
  });

  it('on a unique conflict throws and changes nothing at all', () => {
    const s = users();
    expectConstraint(() => s.update(1, { team: 'ops', email: 'ed@x.io' }), 'email', 'ed@x.io');
    expect(s.get(1).team).toBe('web');
    expect(s.get(1).email).toBe('ana@x.io');
    expect(s.findBy('team', 'ops')).toEqual([]);
    expect(ids(s.findBy('team', 'web'))).toEqual([1, 3, 4]);
    expect(ids(s.findBy('email', 'ana@x.io'))).toEqual([1]);
  });

  it('refuses to change the primary key', () => {
    const s = users();
    let caught;
    try { s.update(1, { id: 10 }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ConstraintError);
    expect(caught.field).toBe('id');
    expect(s.get(1)).toBeDefined();
    expect(s.get(10)).toBeUndefined();
  });

  it('returns null for an unknown id', () => {
    expect(users().update(42, { team: 'x' })).toBeNull();
  });
});

describe('delete', () => {
  it('removes the record from every index and frees its unique values', () => {
    const s = users();
    expect(s.delete(3)).toBe(true);
    expect(s.delete(3)).toBe(false);
    expect(s.size).toBe(4);
    expect(s.get(3)).toBeUndefined();
    expect(ids(s.findBy('team', 'web'))).toEqual([1, 4]);
    expect(ids(s.findBy('role', 'lead'))).toEqual([5]);
    s.insert({ id: 3, email: 'cy@x.io', team: 'web', role: 'lead' });
    expect(ids(s.findBy('team', 'web'))).toEqual([1, 4, 3]);
  });
});

describe('insertMany', () => {
  it('inserts all and returns the stored records', () => {
    const s = new Store({ unique: ['email'] });
    const out = s.insertMany([{ id: 1, email: 'a' }, { id: 2, email: 'b' }]);
    expect(out).toHaveLength(2);
    expect(out.every(Object.isFrozen)).toBe(true);
    expect(s.size).toBe(2);
  });

  it('inserts nothing when one record conflicts with the store', () => {
    const s = users();
    expectConstraint(() => s.insertMany([
      { id: 10, email: 'new1@x.io', team: 'ops' },
      { id: 11, email: 'new2@x.io', team: 'ops' },
      { id: 12, email: 'ana@x.io', team: 'ops' },
    ]), 'email', 'ana@x.io');
    expect(s.size).toBe(5);
    expect(s.get(10)).toBeUndefined();
    expect(s.findBy('team', 'ops')).toEqual([]);
    expect(s.findBy('email', 'new1@x.io')).toEqual([]);
  });

  it('inserts nothing when two records in the batch conflict with each other', () => {
    const s = users();
    expectConstraint(() => s.insertMany([
      { id: 10, email: 'same@x.io' },
      { id: 11, email: 'same@x.io' },
    ]), 'email', 'same@x.io');
    expectConstraint(() => s.insertMany([{ id: 20 }, { id: 20 }]), 'id', 20);
    expect(s.size).toBe(5);
    expect(s.get(10)).toBeUndefined();
    expect(s.get(20)).toBeUndefined();
    s.insert({ id: 10, email: 'same@x.io' });
    expect(s.size).toBe(6);
  });
});

describe('query', () => {
  it('returns everything in insertion order by default', () => {
    expect(ids(users().query())).toEqual([1, 2, 3, 4, 5]);
  });

  it('matches every where field, indexed or not', () => {
    const s = users();
    expect(ids(s.query({ where: { team: 'web', role: 'dev' } }))).toEqual([1, 4]);
    expect(ids(s.query({ where: { age: 25 } }))).toEqual([2, 5]);
    expect(ids(s.query({ where: { age: 25, team: 'api', role: 'lead' } }))).toEqual([5]);
    expect(s.query({ where: { team: 'web', age: 25 } })).toEqual([]);
  });

  it('orders with missing values last and stable ties', () => {
    const s = users();
    expect(ids(s.query({ orderBy: ['age'] }))).toEqual([2, 5, 1, 3, 4]);
    expect(ids(s.query({ orderBy: [{ key: 'age', dir: 'desc' }] }))).toEqual([3, 1, 2, 5, 4]);
    expect(ids(s.query({ where: { team: 'web' }, orderBy: ['role', { key: 'id', dir: 'desc' }] }))).toEqual([4, 1, 3]);
  });

  it('reflects updates and deletes', () => {
    const s = users();
    s.update(4, { role: 'lead', age: 50 });
    s.delete(1);
    expect(ids(s.query({ where: { team: 'web', role: 'lead' }, orderBy: [{ key: 'age', dir: 'desc' }] }))).toEqual([4, 3]);
  });
});
