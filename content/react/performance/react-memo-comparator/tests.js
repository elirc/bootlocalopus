const products = [
  { id: 'a', name: 'Apple', price: 3 },
  { id: 'b', name: 'Bread', price: 2 },
  { id: 'c', name: 'Cheese', price: 7 },
];

const cardRenders = () => solution.renderLog.filter((e) => e.startsWith('card:'));
const reset = () => { solution.renderLog.length = 0; };
const status = () => screen.getByRole('status').textContent;
const add = (name) => fireEvent.click(screen.getByRole('button', { name: 'Add ' + name }));

beforeEach(reset);

describe('Shop: correct first', () => {
  it('adds products to the cart', () => {
    render(<solution.Shop products={products} />);
    add('Apple');
    expect(status()).toBe('Cart: 1 items');
  });

  it('keeps every product when adding one after another', () => {
    render(<solution.Shop products={products} />);
    add('Apple');
    add('Bread');
    // A card that kept an old onAdd adds to the cart as it was when that
    // callback was created, and Apple is lost.
    expect(status()).toBe('Cart: 2 items');
    add('Cheese');
    expect(status()).toBe('Cart: 3 items');
  });

  it('updates the card that was added', () => {
    render(<solution.Shop products={products} />);
    add('Bread');
    const button = screen.getByRole('button', { name: 'Bread in cart' });
    expect(button.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Add Apple' }).disabled).toBe(false);
  });

  it('shows a changed price when the parent passes a new product object', () => {
    const { rerender } = render(<solution.Shop products={products} />);
    const repriced = [products[0], { ...products[1], price: 5 }, products[2]];
    rerender(<solution.Shop products={repriced} />);
    expect(screen.getAllByRole('listitem')[1].textContent).toContain('Bread: $5');
  });
});

describe('Shop: and only then fast', () => {
  it('re-renders no card when unrelated state changes', () => {
    render(<solution.Shop products={products} />);
    reset();
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(solution.renderLog).toContain('shop');
    expect(cardRenders()).toEqual([]);
  });

  it('re-renders only the card whose inCart flipped', () => {
    render(<solution.Shop products={products} />);
    reset();
    add('Bread');
    expect(cardRenders()).toEqual(['card:b']);
    reset();
    add('Cheese');
    expect(cardRenders()).toEqual(['card:c']);
  });

  it('re-renders only the card whose product object changed', () => {
    const { rerender } = render(<solution.Shop products={products} />);
    reset();
    rerender(<solution.Shop products={[products[0], { ...products[1], price: 5 }, products[2]]} />);
    expect(cardRenders()).toEqual(['card:b']);
  });

  it('skips every card when the parent passes a new array of the same objects', () => {
    const { rerender } = render(<solution.Shop products={products} />);
    reset();
    rerender(<solution.Shop products={[...products]} />);
    expect(cardRenders()).toEqual([]);
  });

  it('keeps ProductCard wrapped in memo', () => {
    expect(String(solution.ProductCard.$$typeof)).toContain('memo');
  });
});
