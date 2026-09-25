beforeEach(async () => { await execUser(); });

const next = async (tenant) => {
  const rows = await q('select next_invoice_number($1) as n', [tenant]);
  return rows[0].n === null ? null : num(rows[0].n);
};
const create = async (tenant, cents) => (await q('select * from create_invoice($1, $2)', [tenant, cents]))[0];

/** Runs `sql` inside a savepoint that is always rolled back; resolves to its error or its rows. */
async function thenRollBack(run) {
  await q('savepoint probe');
  try {
    return { value: await run() };
  } catch (error) {
    return { error };
  } finally {
    await q('rollback to savepoint probe');
  }
}

describe('invoice_counters', () => {
  it('exists with tenant_id and last_number', async () => {
    const cols = await q(
      "select column_name from information_schema.columns where table_name = 'invoice_counters' order by column_name",
    );
    expect(cols.map((c) => c.column_name)).toEqual(['last_number', 'tenant_id']);
  });

  it('is seeded from the invoices already issued', async () => {
    const rows = await q('select tenant_id, last_number from invoice_counters where last_number > 0 order by tenant_id');
    expect(rows.map((r) => [r.tenant_id, num(r.last_number)])).toEqual([['acme', 3], ['globex', 12]]);
  });
});

describe('next_invoice_number', () => {
  it('continues each tenant from its highest existing number', async () => {
    expect(await next('acme')).toBe(4);
    expect(await next('globex')).toBe(13);
  });

  it('starts a tenant with no invoices at 1', async () => {
    expect(await next('initech')).toBe(1);
    expect(await next('initech')).toBe(2);
  });

  it('hands out a new number on every call, per tenant, independently', async () => {
    const seen = [];
    for (const t of ['acme', 'initech', 'acme', 'acme', 'initech', 'globex']) seen.push([t, await next(t)]);
    expect(seen).toEqual([['acme', 4], ['initech', 1], ['acme', 5], ['acme', 6], ['initech', 2], ['globex', 13]]);
  });

  it('keeps last_number in invoice_counters up to date', async () => {
    await next('acme');
    await next('acme');
    const rows = await q("select last_number from invoice_counters where tenant_id = 'acme'");
    expect(num(rows[0].last_number)).toBe(5);
  });

  it('does not burn a number when the transaction that took it rolls back', async () => {
    const taken = await thenRollBack(() => next('acme'));
    expect(taken.error).toBeUndefined();
    expect(taken.value).toBe(4);
    expect(await next('acme')).toBe(4);
  });

  it('rejects an unknown tenant with a foreign key violation (23503)', async () => {
    const r = await thenRollBack(() => next('no-such-tenant'));
    assert(r.error, 'expected next_invoice_number(\'no-such-tenant\') to fail');
    expect(r.error.code).toBe('23503');
  });
});

describe('create_invoice', () => {
  it('inserts an invoice with the next number and returns the row', async () => {
    const inv = await create('acme', 2500);
    expect(inv.tenant_id).toBe('acme');
    expect(num(inv.number)).toBe(4);
    expect(num(inv.amount_cents)).toBe(2500);
    const again = await create('acme', 100);
    expect(num(again.number)).toBe(5);
    const stored = await q("select number from invoices where tenant_id = 'acme' order by number");
    expect(stored.map((r) => num(r.number))).toEqual([1, 2, 3, 4, 5]);
  });

  it('leaves no gap when an invoice fails its CHECK', async () => {
    const bad = await thenRollBack(() => create('initech', -5));
    assert(bad.error, 'expected create_invoice with a negative amount to fail');
    expect(bad.error.code).toBe('23514');
    expect(num((await create('initech', 500)).number)).toBe(1);
    expect(num((await create('initech', 600)).number)).toBe(2);
  });

  it('produces an unbroken 1..n sequence across failures and rollbacks', async () => {
    const plan = [700, -1, 800, 0, 900];
    for (const cents of plan) {
      if (cents > 0) await create('initech', cents);
      else await thenRollBack(() => create('initech', cents));
    }
    await thenRollBack(() => next('initech'));
    await create('initech', 1000);
    const rows = await q("select number from invoices where tenant_id = 'initech' order by number");
    expect(rows.map((r) => num(r.number))).toEqual([1, 2, 3, 4]);
  });
});
