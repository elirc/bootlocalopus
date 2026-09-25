export class UnknownProductError extends Error {
  constructor(skus) {
    super(`unknown products: ${skus.join(', ')}`);
    this.name = 'UnknownProductError';
    this.skus = skus;
  }
}

export class OutOfStockError extends Error {
  constructor(skus) {
    super(`not enough stock for: ${skus.join(', ')}`);
    this.name = 'OutOfStockError';
    this.skus = skus;
  }
}

export class NotFoundError extends Error {
  constructor(entity, options) {
    super(`${entity} not found`, options);
    this.name = 'NotFoundError';
    this.entity = entity;
  }
}

/**
 * Place an order. The prototype: a query per line, no transaction, no
 * idempotency, and a stock check that another order can slip past.
 */
export async function placeOrder(conn, { customerId, lines, idempotencyKey }) {
  let total = 0;
  const order = await conn.query(
    'insert into orders (customer_id, total_cents, idempotency_key) values ($1, 0, $2) returning id',
    [customerId, idempotencyKey],
  );
  const orderId = order.rows[0].id;
  const out = [];
  for (const [i, line] of lines.entries()) {
    const p = (await conn.query('select id, price_cents, stock from products where sku = $1', [line.sku])).rows[0];
    if (p.stock < line.qty) throw new OutOfStockError([line.sku]);
    await conn.query('update products set stock = stock - $1 where id = $2', [line.qty, p.id]);
    await conn.query(
      'insert into order_lines (order_id, line_no, product_id, qty, unit_price_cents) values ($1, $2, $3, $4, $5)',
      [orderId, i + 1, p.id, line.qty, p.price_cents],
    );
    total += line.qty * p.price_cents;
    out.push({ lineNo: i + 1, sku: line.sku, qty: line.qty, unitPriceCents: p.price_cents });
  }
  await conn.query('update orders set total_cents = $1 where id = $2', [total, orderId]);
  return { id: orderId, customerId, status: 'placed', totalCents: total, lines: out };
}

export async function getOrder(conn, id) {
  throw new Error('not implemented');
}

export async function cancelOrder(conn, id) {
  throw new Error('not implemented');
}
