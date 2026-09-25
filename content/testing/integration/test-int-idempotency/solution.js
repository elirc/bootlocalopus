function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

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

/** A provider fake that records every call and succeeds, unless told to fail next. */
function fakeProvider() {
  const calls = [];
  let failNext = false;
  const charge = async (req) => {
    calls.push(req);
    if (failNext) {
      failNext = false;
      throw new Error('card declined by upstream');
    }
    return { chargeId: `ch_${calls.length}` };
  };
  return { charge, calls, failOnce: () => { failNext = true; } };
}

const ORDER = { customerId: 'c1', amountCents: 500 };

describe('first request', () => {
  it('charges once and answers 201 with the payment', async () => {
    const provider = fakeProvider();
    await withApp(provider.charge, async (pay) => {
      const { status, body } = await pay(ORDER, { key: 'k1' });
      expect(status).toBe(201);
      expect(body).toMatchObject({ customerId: 'c1', amountCents: 500, chargeId: 'ch_1' });
      expect(typeof body.id).toBe('string');
      expect(provider.calls).toEqual([{ customerId: 'c1', amountCents: 500 }]);
    });
  });

  it('refuses a request with no key, without charging', async () => {
    const provider = fakeProvider();
    await withApp(provider.charge, async (pay) => {
      const { status, body } = await pay(ORDER);
      expect(status).toBe(400);
      expect(body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(provider.calls).toHaveLength(0);
    });
  });
});

describe('retries', () => {
  it('replays the stored 201 and body without charging again', async () => {
    const provider = fakeProvider();
    await withApp(provider.charge, async (pay) => {
      const first = await pay(ORDER, { key: 'k1' });
      const second = await pay(ORDER, { key: 'k1' });
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(second.headers.get('idempotent-replayed')).toBe('true');
      expect(provider.calls).toHaveLength(1);
    });
  });

  it('treats the same body with keys in another order as the same request', async () => {
    const provider = fakeProvider();
    await withApp(provider.charge, async (pay) => {
      const first = await pay({ customerId: 'c1', amountCents: 500 }, { key: 'k1' });
      const second = await pay({ amountCents: 500, customerId: 'c1' }, { key: 'k1' });
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(provider.calls).toHaveLength(1);
    });
  });

  it('rejects the same key with a different body (422) and does not charge it', async () => {
    const provider = fakeProvider();
    await withApp(provider.charge, async (pay) => {
      await pay(ORDER, { key: 'k1' });
      const changed = await pay({ ...ORDER, amountCents: 5000 }, { key: 'k1' });
      expect(changed.status).toBe(422);
      expect(changed.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(provider.calls).toHaveLength(1);
    });
  });

  it('different keys are different payments', async () => {
    const provider = fakeProvider();
    await withApp(provider.charge, async (pay) => {
      const a = await pay(ORDER, { key: 'k1' });
      const b = await pay(ORDER, { key: 'k2' });
      expect(b.status).toBe(201);
      expect(b.body.id).not.toBe(a.body.id);
      expect(provider.calls).toHaveLength(2);
    });
  });
});

describe('failures', () => {
  it('releases the key after a failed charge, so a retry charges', async () => {
    const provider = fakeProvider();
    provider.failOnce();
    await withApp(provider.charge, async (pay) => {
      const failed = await pay(ORDER, { key: 'k1' });
      expect(failed.status).toBe(502);
      expect(failed.body.error.code).toBe('PAYMENT_FAILED');

      const retry = await pay(ORDER, { key: 'k1' });
      expect(retry.status).toBe(201);
      expect(provider.calls).toHaveLength(2);
    });
  });

  it('answers 409 to the same key while the first request is still charging', async () => {
    const calls = [];
    const gate = deferred();
    const started = deferred();
    // Only the first call waits on the gate. A buggy second charge settles at once,
    // so the test fails on its assertions instead of hanging until the timeout.
    const charge = async (req) => {
      calls.push(req);
      if (calls.length > 1) return { chargeId: `ch_${calls.length}` };
      started.resolve();
      return gate.promise;
    };
    await withApp(charge, async (pay) => {
      const first = pay(ORDER, { key: 'k1' });
      await started.promise; // the first request is now inside charge()
      const second = await pay(ORDER, { key: 'k1' });
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('IDEMPOTENCY_KEY_IN_USE');

      gate.resolve({ chargeId: 'ch_1' });
      expect((await first).status).toBe(201);
      expect(calls).toHaveLength(1);
    });
  });
});
