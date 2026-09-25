import { useState, memo, useCallback } from 'react';

export const renderLog = [];

function ProductCardImpl({ product, inCart, onAdd, style }) {
  renderLog.push('card:' + product.id);
  return (
    <li style={style}>
      {product.name}: ${product.price}
      <button onClick={() => onAdd(product.id)} disabled={inCart}>
        {inCart ? product.name + ' in cart' : 'Add ' + product.name}
      </button>
    </li>
  );
}

// The default comparison checks every prop with Object.is. That is only
// cheap and correct if every prop is either data that really changed or a
// value whose identity is stable, which is the job of the parent below.
export const ProductCard = memo(ProductCardImpl);

// A constant object: one identity for the life of the module.
const cardStyle = { padding: 8 };

export function Shop({ products }) {
  renderLog.push('shop');
  const [cart, setCart] = useState([]);
  const [refreshes, setRefreshes] = useState(0);

  // A functional update reads the latest cart when it runs, so the callback
  // needs no dependencies: stable identity AND never stale. `[cart]` would be
  // correct but would hand every card a new function on every add.
  const onAdd = useCallback((id) => setCart((current) => [...current, id]), []);

  return (
    <div>
      <button onClick={() => setRefreshes((n) => n + 1)}>Refresh ({refreshes})</button>
      <p role="status">Cart: {cart.length} items</p>
      <ul>
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            inCart={cart.includes(product.id)}
            onAdd={onAdd}
            style={cardStyle}
          />
        ))}
      </ul>
    </div>
  );
}
