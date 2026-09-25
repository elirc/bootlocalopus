export class WalletNotFoundError extends Error {
  constructor(walletId) {
    super(`wallet ${walletId} does not exist`);
    this.name = 'WalletNotFoundError';
    this.walletId = walletId;
  }
}

export class InsufficientFundsError extends Error {
  constructor(walletId) {
    super(`wallet ${walletId} has insufficient funds`);
    this.name = 'InsufficientFundsError';
    this.walletId = walletId;
  }
}

const isNonZeroInt = (n) => Number.isSafeInteger(n) && n !== 0;
const isPositiveInt = (n) => Number.isSafeInteger(n) && n > 0;

function validate({ memo, lines } = {}) {
  if (typeof memo !== 'string' || memo.length === 0) throw new RangeError('memo is required');
  if (!Array.isArray(lines) || lines.length < 2) throw new RangeError('a payment needs at least two lines');
  const seen = new Set();
  let sum = 0;
  for (const line of lines) {
    const { walletId, amountCents } = line ?? {};
    if (!isPositiveInt(walletId)) throw new RangeError('walletId must be a positive integer');
    if (seen.has(walletId)) throw new RangeError(`wallet ${walletId} appears twice`);
    if (!isNonZeroInt(amountCents)) throw new RangeError('amountCents must be a non-zero integer');
    seen.add(walletId);
    sum += amountCents;
  }
  if (sum !== 0) throw new RangeError('the lines of a payment must sum to 0');
  // Sorted once, here: every lock below follows this order.
  return [...lines].sort((a, b) => a.walletId - b.walletId);
}

/**
 * Post a split payment. Resolves to { paymentId, balances }.
 *
 * Every payment locks its wallets in ascending id order, so two payments
 * over the same wallets may wait for each other but can never deadlock.
 */
export async function postPayment(conn, input) {
  const lines = validate(input);
  const ids = lines.map((l) => l.walletId);
  const amounts = lines.map((l) => l.amountCents);

  await conn.query('begin');
  try {
    // One statement locks them all; ORDER BY makes the lock order the id order.
    const locked = await conn.query(
      'select id, balance_cents from wallets where id = any($1::int[]) order by id for update',
      [ids],
    );
    const balanceOf = new Map(locked.rows.map((r) => [r.id, r.balance_cents]));
    for (const { walletId } of lines) {
      if (!balanceOf.has(walletId)) throw new WalletNotFoundError(walletId);
    }
    for (const { walletId, amountCents } of lines) {
      if (balanceOf.get(walletId) + amountCents < 0) throw new InsufficientFundsError(walletId);
    }

    // The rows are already locked, so this update adds no new lock order.
    const updated = await conn.query(
      `update wallets w set balance_cents = w.balance_cents + v.amount
         from unnest($1::int[], $2::int[]) as v(id, amount)
        where w.id = v.id
        returning w.id, w.balance_cents`,
      [ids, amounts],
    );
    const payment = await conn.query('insert into payments (memo) values ($1) returning id', [input.memo]);
    const paymentId = payment.rows[0].id;
    await conn.query(
      `insert into payment_lines (payment_id, wallet_id, amount_cents)
       select $1, id, amount from unnest($2::int[], $3::int[]) as v(id, amount)`,
      [paymentId, ids, amounts],
    );
    await conn.query('commit');

    const balances = updated.rows
      .map((r) => ({ walletId: r.id, balanceCents: r.balance_cents }))
      .sort((a, b) => a.walletId - b.walletId);
    return { paymentId, balances };
  } catch (err) {
    await conn.query('rollback').catch(() => {});
    throw err;
  }
}
