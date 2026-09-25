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

/**
 * Post a split payment. Resolves to { paymentId, balances }.
 *
 * In production today: one transaction, but the wallets are updated in the
 * order the caller listed them, so two payments over the same wallets in
 * opposite orders deadlock.
 */
export async function postPayment(conn, { memo, lines }) {
  await conn.query('begin');
  try {
    const balances = [];
    for (const { walletId, amountCents } of lines) {
      const { rows } = await conn.query(
        'update wallets set balance_cents = balance_cents + $1 where id = $2 returning balance_cents',
        [amountCents, walletId],
      );
      balances.push({ walletId, balanceCents: rows[0].balance_cents });
    }
    const payment = await conn.query('insert into payments (memo) values ($1) returning id', [memo]);
    await conn.query('commit');
    return { paymentId: payment.rows[0].id, balances };
  } catch (err) {
    await conn.query('rollback');
    throw err;
  }
}
