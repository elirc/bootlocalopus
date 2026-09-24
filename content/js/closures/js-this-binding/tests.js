describe('Cart', () => {
  it('still adds single items and chains', () => {
    const cart = new solution.Cart();
    expect(cart.add({ price: 3 })).toBe(cart);
    expect(cart.items).toHaveLength(1);
  });
  it('addAll works', () => {
    const cart = new solution.Cart();
    cart.addAll([{ price: 5 }, { price: 6 }]);
    expect(cart.items).toHaveLength(2);
    expect(cart.total).toBe(11);
  });
  it('describe survives being detached from the instance', () => {
    const cart = new solution.Cart();
    cart.addAll([{ price: 5 }, { price: 6 }]);
    const detached = cart.describe;
    expect(detached(0)).toBe('item @ 5');
    expect([0, 1].map(cart.describe)).toEqual(['item @ 5', 'item @ 6']);
  });
  it('keeps items per instance', () => {
    const a = new solution.Cart();
    const b = new solution.Cart();
    a.add({ price: 1 });
    expect(b.items).toEqual([]);
  });
  it('total is still a getter, not a method', () => {
    const cart = new solution.Cart();
    cart.add({ price: 2 });
    expect(cart.total).toBe(2);
  });
});