/**
 * Starts the app with `orders` on a free port, hands you `get`, and always closes the server.
 *   const { status, headers, text } = await get('/reports/orders.csv?from=2024-01-01&to=2024-01-31');
 */
async function withApp(orders, fn) {
  const server = solution.createApp({ orders });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const get = async (path) => {
    const res = await fetch(base + path);
    return { status: res.status, headers: res.headers, text: await res.text() };
  };
  try {
    return await fn(get);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const order = (id, customer, totalCents, placedAt) => ({ id, customer, totalCents, placedAt });

describe('orders export', () => {
  it('exports January', async () => {
    const orders = [order('o1', 'Alice', 1000, '2024-01-10T09:00:00Z')];
    await withApp(orders, async (get) => {
      const { status, text } = await get('/reports/orders.csv?from=2024-01-01&to=2024-01-31');
      expect(status).toBe(200);
      expect(text).toContain('Alice');
    });
  });

  // TODO: headers, exact lines and line endings, the last day, money formats,
  // commas and quotes, formula injection, bad ranges.
});
