import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
export const FREE_SHIPPING_CENTS = 5000;
const STORAGE_KEY = 'cart';

const money = (cents) => `£${(cents / 100).toFixed(2)}`;

function load(storage) {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

/** `storage` is anything with getItem/setItem (localStorage in the app, a fake in tests). */
export function CartProvider({ storage, children }) {
  const [items, setItems] = useState(() => load(storage));

  useEffect(() => {
    storage?.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, storage]);

  const value = useMemo(() => ({
    items,
    add: (product) => setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { id: product.id, name: product.name, priceCents: product.priceCents, qty: 1 }];
    }),
    remove: (id) => setItems((prev) => prev.filter((i) => i.id !== id)),
  }), [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error('useCart must be used inside a CartProvider');
  return cart;
}

export function AddToCartButton({ product }) {
  const { add } = useCart();
  return <button type="button" onClick={() => add(product)}>Add {product.name} to cart</button>;
}

export function CartSummary() {
  const { items, remove } = useCart();
  const count = items.reduce((n, i) => n + i.qty, 0);
  const total = items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);

  return (
    <section aria-label="Cart">
      <p data-testid="cart-count">{count} {count === 1 ? 'item' : 'items'}</p>
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            {i.name} × {i.qty}
            <button type="button" onClick={() => remove(i.id)}>Remove {i.name}</button>
          </li>
        ))}
      </ul>
      <p data-testid="cart-total">{money(total)}</p>
      <p data-testid="shipping">
        {total > FREE_SHIPPING_CENTS ? 'Free shipping!' : `Spend ${money(FREE_SHIPPING_CENTS - total)} more for free shipping`}
      </p>
    </section>
  );
}
