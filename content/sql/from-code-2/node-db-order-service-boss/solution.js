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

const MAX_LINES = 50;
const isId = (v) => Number.isSafeInteger(v) && v > 0;
const isText = (v) => typeof v === 'string' && v.length > 0;
const bySku = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

async function withTransaction(conn, work) {
  await conn.query('begin');
  try {
    const result = await work();
    await conn.query('commit');
    return result;
  } catch (err) {
    await conn.query('rollback').catch(() => {});
    throw err;
  }
}

function validateOrder({ customerId, lines, idempotencyKey } = {}) {
  if (!isId(customerId)) throw new RangeError('customerId must be a positive integer');
  if (!isText(idempotencyKey)) throw new RangeError('idempotencyKey is required');
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES) {
    throw new RangeError(`lines must hold 1 to ${MAX_LINES} lines`);
  }
  const seen = new Set();
  for (const line of lines) {
    if (!line || !isText(line.sku)) throw new RangeError('every line needs a sku');
    if (!Number.isSafeInteger(line.qty) || line.qty < 1) throw new RangeError(`qty for ${line.sku} must be a positive integer`);
    if (seen.has(line.sku)) throw new RangeError(`${line.sku} appears twice`);
    seen.add(line.sku);
  }
}

/** Read one order and its lines, mapped for the application. */
async function readOrder(conn, id) {
  const { rows } = await conn.query(
    `select o.id, o.customer_id, o.status, o.total_cents,
            l.line_no, p.sku, l.qty, l.unit_price_cents
       from orders o
       join order_lines l on l.order_id = o.id
       join products p on p.id = l.product_id
      where o.id = $1
      order by l.line_no`,
    [id],
  );
  if (rows.length === 0) return null;
  const [first] = rows;
  return {
    id: first.id,
    customerId: first.customer_id,
    status: first.status,
    totalCents: first.total_cents,
    lines: rows.map((r) => ({ lineNo: r.line_no, sku: r.sku, qty: r.qty, unitPriceCents: r.unit_price_cents })),
  };
}

export async function getOrder(conn, id) {
  if (!isId(id)) throw new RangeError('id must be a positive integer');
  return readOrder(conn, id);
}

/**
 * Place an order: all lines or none, a fixed number of statements however
 * many lines, and exactly once per idempotency key.
 */
export async function placeOrder(conn, input) {
  validateOrder(input);
  const { customerId, lines, idempotencyKey } = input;

  return withTransaction(conn, async () => {
    const seen = await conn.query('select id from orders where idempotency_key = $1', [idempotencyKey]);
    if (seen.rows.length > 0) return readOrder(conn, seen.rows[0].id);

    // Lock every product row in id order (no deadlock with a concurrent
    // order for the same products), and read price and stock under the lock.
    const skus = lines.map((l) => l.sku);
    const found = await conn.query(
      'select id, sku, price_cents, stock from products where sku = any($1::text[]) order by id for update',
      [skus],
    );
    const product = new Map(found.rows.map((r) => [r.sku, r]));
    const unknown = skus.filter((s) => !product.has(s)).sort(bySku);
    if (unknown.length > 0) throw new UnknownProductError(unknown);
    const short = lines.filter((l) => product.get(l.sku).stock < l.qty).map((l) => l.sku).sort(bySku);
    if (short.length > 0) throw new OutOfStockError(short);

    const productIds = lines.map((l) => product.get(l.sku).id);
    const qtys = lines.map((l) => l.qty);
    const prices = lines.map((l) => product.get(l.sku).price_cents);
    const totalCents = lines.reduce((sum, l, i) => sum + l.qty * prices[i], 0);

    // The customer is checked by its foreign key, not by a SELECT first.
    let orderId;
    try {
      const order = await conn.query(
        'insert into orders (customer_id, total_cents, idempotency_key) values ($1, $2, $3) returning id',
        [customerId, totalCents, idempotencyKey],
      );
      orderId = order.rows[0].id;
    } catch (err) {
      if (err && err.code === '23503' && err.constraint === 'orders_customer_id_fkey') {
        throw new NotFoundError('customer', { cause: err });
      }
      throw err;
    }

    // One statement for every line, one for every stock change.
    await conn.query(
      `insert into order_lines (order_id, line_no, product_id, qty, unit_price_cents)
       select $1, x.line_no, x.product_id, x.qty, x.price
         from unnest($2::int[], $3::int[], $4::int[], $5::int[]) as x(line_no, product_id, qty, price)`,
      [orderId, lines.map((_, i) => i + 1), productIds, qtys, prices],
    );
    await conn.query(
      `update products p set stock = p.stock - x.qty
         from unnest($1::int[], $2::int[]) as x(product_id, qty)
        where p.id = x.product_id`,
      [productIds, qtys],
    );

    return {
      id: orderId,
      customerId,
      status: 'placed',
      totalCents,
      lines: lines.map((l, i) => ({ lineNo: i + 1, sku: l.sku, qty: l.qty, unitPriceCents: prices[i] })),
    };
  });
}

/**
 * Cancel a placed order and put its stock back. Cancelling twice restocks
 * once. Resolves to the order, or null when there is none.
 */
export async function cancelOrder(conn, id) {
  if (!isId(id)) throw new RangeError('id must be a positive integer');
  return withTransaction(conn, async () => {
    // Only the call that flips placed → cancelled restocks.
    const flipped = await conn.query(
      "update orders set status = 'cancelled' where id = $1 and status = 'placed' returning id",
      [id],
    );
    if (flipped.rows.length === 1) {
      await conn.query(
        `update products p set stock = p.stock + l.qty
           from order_lines l
          where l.order_id = $1 and p.id = l.product_id`,
        [id],
      );
    }
    return readOrder(conn, id);
  });
}
