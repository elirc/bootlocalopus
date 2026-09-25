const { Model } = solution;

class User extends Model {
  static fields = ['id', 'email'];
  get domain() {
    return this.email ? this.email.split('@')[1] : null;
  }
}

class Admin extends User {
  static fields = [...User.fields, 'level'];
}

class Product extends Model {
  static fields = ['sku', 'price'];
}

describe('construction', () => {
  it('refuses to build a bare Model', () => {
    expect(() => new Model({})).toThrow(TypeError);
    expect(() => Model.fromJSON('{}')).toThrow(TypeError);
  });

  it('sets exactly the declared fields, null when missing', () => {
    const u = new User({ id: 1, password: 'hunter2' });
    expect(Object.keys(u).sort()).toEqual(['email', 'id']);
    expect(u.id).toBe(1);
    expect(u.email).toBeNull();
    expect(u.password).toBeUndefined();
    expect(new User({ id: 2, email: undefined }).email).toBeNull();
  });

  it('keeps falsy values that are not missing', () => {
    const p = new Product({ sku: '', price: 0 });
    expect(p.sku).toBe('');
    expect(p.price).toBe(0);
  });

  it('a sub-subclass gets its own field list', () => {
    const a = new Admin({ id: 3, email: 'root@corp.io', level: 9 });
    expect(a.toJSON()).toEqual({ id: 3, email: 'root@corp.io', level: 9 });
    expect(new User({ level: 9 }).level).toBeUndefined();
  });

  it('Model.fields is an empty array', () => {
    expect(Model.fields).toEqual([]);
  });
});

describe('static factories respect the subclass', () => {
  it('fromJSON returns an instance of the class it was called on', () => {
    const u = User.fromJSON('{"id":1,"email":"ada@example.com"}');
    expect(u).toBeInstanceOf(User);
    expect(u.domain).toBe('example.com');
    const a = Admin.fromJSON('{"id":2,"level":3}');
    expect(a).toBeInstanceOf(Admin);
    expect(a.level).toBe(3);
  });

  it('many maps rows to instances of the class it was called on', () => {
    const products = Product.many([{ sku: 'A', price: 1 }, { sku: 'B', price: 2 }]);
    expect(products).toHaveLength(2);
    expect(products.every((p) => p instanceof Product)).toBe(true);
    expect(products[1].sku).toBe('B');
    expect(Admin.many([{ id: 1 }])[0]).toBeInstanceOf(Admin);
  });
});

describe('instance methods respect the subclass', () => {
  it('toJSON outputs exactly the fields', () => {
    const u = new User({ id: 1, email: 'a@b.c' });
    u.scratch = 'not a field';
    expect(u.toJSON()).toEqual({ id: 1, email: 'a@b.c' });
    expect(JSON.parse(JSON.stringify({ user: u }))).toEqual({ user: { id: 1, email: 'a@b.c' } });
  });

  it('clone returns the same class with changes applied, original untouched', () => {
    const a = new Admin({ id: 1, email: 'x@y.z', level: 1 });
    const promoted = a.clone({ level: 2, junk: true });
    expect(promoted).toBeInstanceOf(Admin);
    expect(promoted).not.toBe(a);
    expect(promoted.toJSON()).toEqual({ id: 1, email: 'x@y.z', level: 2 });
    expect(promoted.junk).toBeUndefined();
    expect(a.level).toBe(1);
    expect(new User({ id: 5 }).clone()).toBeInstanceOf(User);
  });

  it('equals compares class and fields', () => {
    const u1 = new User({ id: 1, email: 'a@b.c' });
    const u2 = new User({ id: 1, email: 'a@b.c' });
    const u3 = new User({ id: 1, email: 'other@b.c' });
    const a = new Admin({ id: 1, email: 'a@b.c' });
    expect(u1.equals(u2)).toBe(true);
    expect(u1.equals(u3)).toBe(false);
    expect(u1.equals(a)).toBe(false);
    expect(a.equals(u1)).toBe(false);
    expect(u1.equals({ id: 1, email: 'a@b.c' })).toBe(false);
    expect(u1.equals(null)).toBe(false);
    expect(new Product({ price: NaN }).equals(new Product({ price: NaN }))).toBe(true);
  });

  it('toStringTag names the concrete class', () => {
    expect(String(new User({}))).toBe('[object User]');
    expect(Object.prototype.toString.call(new Admin({}))).toBe('[object Admin]');
  });
});
