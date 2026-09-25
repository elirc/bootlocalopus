const MUG = { id: 'mug', name: 'Mug', priceCents: 1250 };
const PEN = { id: 'pen', name: 'Pen', priceCents: 300 };

/** A fake storage with the same two methods as localStorage. */
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}

/** The shop page in miniature: buttons and summary under one provider. */
function Shop({ storage = fakeStorage() }) {
  return (
    <solution.CartProvider storage={storage}>
      <solution.AddToCartButton product={MUG} />
      <solution.AddToCartButton product={PEN} />
      <solution.CartSummary />
    </solution.CartProvider>
  );
}

const add = (name) => fireEvent.click(screen.getByRole('button', { name: `Add ${name} to cart` }));

describe('cart', () => {
  it('counts an added item', () => {
    render(<Shop />);
    add('Mug');
    expect(screen.getByTestId('cart-count').textContent).toBe('1 item');
  });

  // TODO: the same product twice, totals, the shipping threshold, Remove,
  // storage in both directions, and useCart outside a provider.
});
