export class InsufficientFundsError extends Error {
  constructor(accountId) {
    super(`account ${accountId} has insufficient funds`);
    this.name = 'InsufficientFundsError';
    this.accountId = accountId;
  }
}

export class AccountNotFoundError extends Error {
  constructor(accountId) {
    super(`account ${accountId} does not exist`);
    this.name = 'AccountNotFoundError';
    this.accountId = accountId;
  }
}

export class IdempotencyKeyReusedError extends Error {
  constructor(key) {
    super(`idempotency key ${key} was already used for a different transfer`);
    this.name = 'IdempotencyKeyReusedError';
    this.key = key;
  }
}

/**
 * Move `cents` from one account to another.
 * Resolves to { transferId, fromBalanceCents, toBalanceCents }.
 *
 * What is in production today: no transaction, a read-then-write balance
 * check, and a retry from the client moves the money twice.
 */
export async function transfer(conn, { from, to, cents, idempotencyKey }) {
  const { rows } = await conn.query('select balance_cents from accounts where id = $1', [from]);
  if (rows.length === 0) throw new AccountNotFoundError(from);
  if (rows[0].balance_cents < cents) throw new InsufficientFundsError(from);

  const debit = await conn.query(
    'update accounts set balance_cents = balance_cents - $1 where id = $2 returning balance_cents',
    [cents, from],
  );
  const credit = await conn.query(
    'update accounts set balance_cents = balance_cents + $1 where id = $2 returning balance_cents',
    [cents, to],
  );
  const t = await conn.query(
    'insert into transfers (from_id, to_id, cents) values ($1, $2, $3) returning id',
    [from, to, cents],
  );
  return {
    transferId: t.rows[0].id,
    fromBalanceCents: debit.rows[0].balance_cents,
    toBalanceCents: credit.rows[0].balance_cents,
  };
}
