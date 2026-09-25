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

// "Fixed" the re-renders. The cards stopped re-rendering... and stopped
// being correct.
export const ProductCard = memo(ProductCardImpl, (prev, next) => prev.product.id === next.product.id);

export function Shop({ products }) {
  renderLog.push('shop');
  const [cart, setCart] = useState([]);
  const [refreshes, setRefreshes] = useState(0);

  const onAdd = (id) => setCart([...cart, id]);

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
            style={{ padding: 8 }}
          />
        ))}
      </ul>
    </div>
  );
}
