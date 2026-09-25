// Same behaviour: a reducer, Intl money formatting, a <table>, a different error message.
import { createContext, useContext, useEffect, useReducer } from 'react';

export const FREE_SHIPPING_CENTS = 5000;
const Ctx = createContext(undefined);
const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

function cartReducer(lines, action) {
  if (action.type === 'add') {
    const { id, name, priceCents } = action.product;
    return lines.some((l) => l.id === id)
      ? lines.map((l) => (l.id === id ? { ...l, qty: l.qty + 1 } : l))
      : lines.concat({ id, name, priceCents, qty: 1 });
  }
  if (action.type === 'remove') return lines.filter((l) => l.id !== action.id);
  return lines;
}

function readSaved(storage) {
  if (!storage) return [];
  try {
    return JSON.parse(storage.getItem('cart') || '[]');
  } catch {
    return [];
  }
}

export function CartProvider({ storage, children }) {
  const [lines, dispatch] = useReducer(cartReducer, storage, readSaved);
  useEffect(() => {
    if (storage) storage.setItem('cart', JSON.stringify(lines));
  }, [lines, storage]);
  const api = { items: lines, add: (product) => dispatch({ type: 'add', product }), remove: (id) => dispatch({ type: 'remove', id }) };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart() {
  const api = useContext(Ctx);
  if (api === undefined || api === null) throw new Error('No CartProvider above this component');
  return api;
}

export function AddToCartButton({ product }) {
  const cart = useCart();
  return <button onClick={() => cart.add(product)} className="btn">{`Add ${product.name} to cart`}</button>;
}

export function CartSummary() {
  const { items, remove } = useCart();
  let count = 0;
  let total = 0;
  for (const l of items) {
    count += l.qty;
    total += l.qty * l.priceCents;
  }
  const remaining = FREE_SHIPPING_CENTS - total;
  return (
    <aside aria-label="Cart">
      <h3 data-testid="cart-count">{`${count} item${count === 1 ? '' : 's'}`}</h3>
      <table>
        <tbody>
          {items.map((l) => (
            <tr key={l.id}>
              <td>{l.name}</td>
              <td>× {l.qty}</td>
              <td><button onClick={() => remove(l.id)}>{`Remove ${l.name}`}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <strong data-testid="cart-total">{gbp.format(total / 100)}</strong>
      <div data-testid="shipping">{remaining <= 0 ? 'Free shipping!' : `Spend ${gbp.format(remaining / 100)} more for free shipping`}</div>
    </aside>
  );
}
