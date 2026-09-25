const MUG = { id: 'mug', name: 'Mug', priceCents: 1250 };
const PEN = { id: 'pen', name: 'Pen', priceCents: 300 };

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}

function Shop({ storage = fakeStorage(), products = [MUG, PEN] }) {
  return (
    <solution.CartProvider storage={storage}>
      {products.map((p) => <solution.AddToCartButton key={p.id} product={p} />)}
      <solution.CartSummary />
    </solution.CartProvider>
  );
}

const add = (name, times = 1) => {
  for (let i = 0; i < times; i++) fireEvent.click(screen.getByRole('button', { name: `Add ${name} to cart` }));
};
const count = () => screen.getByTestId('cart-count').textContent;
const total = () => screen.getByTestId('cart-total').textContent;
const shipping = () => screen.getByTestId('shipping').textContent;
const lineTexts = () => screen.getAllByRole('button', { name: /^Remove / }).map((b) => b.textContent);

describe('adding', () => {
  it('starts empty', () => {
    render(<Shop />);
    expect(count()).toBe('0 items');
    expect(total()).toBe('£0.00');
  });

  it('adding the same product twice makes one line with qty 2', () => {
    render(<Shop />);
    add('Mug', 2);
    expect(lineTexts()).toEqual(['Remove Mug']);
    expect(count()).toBe('2 items');
    expect(total()).toBe('£25.00');
  });

  it('counts quantity, not lines, with the right plural', () => {
    render(<Shop />);
    add('Mug');
    expect(count()).toBe('1 item');
    add('Pen', 3);
    expect(count()).toBe('4 items');
    expect(total()).toBe('£21.50');
  });
});

describe('shipping', () => {
  it('asks for the difference below £50', () => {
    render(<Shop />);
    add('Mug', 3); // £37.50
    expect(shipping()).toBe('Spend £12.50 more for free shipping');
  });

  it('is free at exactly £50', () => {
    render(<Shop products={[{ id: 'kettle', name: 'Kettle', priceCents: 2500 }]} />);
    add('Kettle', 2);
    expect(total()).toBe('£50.00');
    expect(shipping()).toBe('Free shipping!');
  });
});

describe('removing', () => {
  it('removes the line whose button was clicked', () => {
    render(<Shop />);
    add('Mug');
    add('Pen');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pen' }));
    expect(lineTexts()).toEqual(['Remove Mug']);
    expect(total()).toBe('£12.50');
  });
});

describe('storage', () => {
  it('loads the saved cart on mount', () => {
    const storage = fakeStorage({ cart: JSON.stringify([{ ...PEN, qty: 2 }]) });
    render(<Shop storage={storage} />);
    expect(count()).toBe('2 items');
    expect(lineTexts()).toEqual(['Remove Pen']);
  });

  it('saves every change', () => {
    const storage = fakeStorage();
    render(<Shop storage={storage} />);
    add('Mug', 2);
    expect(JSON.parse(storage.data.get('cart'))).toEqual([{ id: 'mug', name: 'Mug', priceCents: 1250, qty: 2 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mug' }));
    expect(JSON.parse(storage.data.get('cart'))).toEqual([]);
  });
});

describe('useCart', () => {
  it('throws outside a CartProvider', () => {
    const original = console.error;
    console.error = () => {}; // React logs the error it is about to rethrow
    try {
      expect(() => renderHook(() => solution.useCart())).toThrow(Error);
    } finally {
      console.error = original;
    }
  });
});
