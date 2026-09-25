/** A promise you settle by hand. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/**
 * Starts the app with your `charge` on a free port, hands you `pay`, and always closes the server.
 *   const { status, headers, body } = await pay({ customerId: 'c1', amountCents: 500 }, { key: 'k1' });
 */
async function withApp(charge, fn) {
  const server = solution.createApp({ charge });
  await new Promise((resolve) => server.listen(0, resolve));
  const url = `http://localhost:${server.address().port}/payments`;
  const pay = async (body, { key } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (key !== undefined) headers['idempotency-key'] = key;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  };
  try {
    return await fn(pay);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('POST /payments', () => {
  it('charges once for a new key', async () => {
    const calls = [];
    const charge = async (req) => { calls.push(req); return { chargeId: `ch_${calls.length}` }; };
    await withApp(charge, async (pay) => {
      const { status } = await pay({ customerId: 'c1', amountCents: 500 }, { key: 'k1' });
      expect(status).toBe(201);
    });
  });

  // TODO: replays (and how many times charge ran), a changed body, no key,
  // a failed charge then a retry, and two requests at once.
});
