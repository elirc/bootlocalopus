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

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;

function validate(input) {
  const { from, to, cents, idempotencyKey } = input ?? {};
  if (!isNonEmptyString(from) || !isNonEmptyString(to)) throw new RangeError('from and to must be account ids');
  if (from === to) throw new RangeError('cannot transfer to the same account');
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new RangeError('cents must be a positive integer');
  if (!isNonEmptyString(idempotencyKey)) throw new RangeError('idempotencyKey is required');
  return { from, to, cents, idempotencyKey };
}

/**
 * Move `cents` between two accounts, exactly once per idempotency key.
 * Resolves to { transferId, fromBalanceCents, toBalanceCents }.
 */
export async function transfer(conn, input) {
  const { from, to, cents, idempotencyKey } = validate(input);

  await conn.query('begin');
  try {
    const result = await transferInTransaction(conn, { from, to, cents }, idempotencyKey);
    await conn.query('commit');
    return result;
  } catch (err) {
    // Whatever went wrong — our typed error, a constraint, a dropped
    // connection — nothing this transaction wrote may survive. If the
    // rollback itself fails, the original error is still the one to report.
    await conn.query('rollback').catch(() => {});
    throw err;
  }
}

async function transferInTransaction(conn, request, key) {
  const { from, to, cents } = request;

  // A replay returns what the first call returned, even though balances
  // have moved since. (Under real concurrency, two first attempts with the
  // same key race to the INSERT below; the loser hits the primary key, rolls
  // back, and its retry lands here.)
  const seen = await conn.query('select request, response from idempotency_keys where key = $1', [key]);
  if (seen.rows.length > 0) {
    const { request: stored, response } = seen.rows[0];
    if (stored.from !== from || stored.to !== to || stored.cents !== cents) {
      throw new IdempotencyKeyReusedError(key);
    }
    return response;
  }

  // The check and the write are one statement, so no other transaction can
  // spend the money between them.
  const debit = await conn.query(
    `update accounts set balance_cents = balance_cents - $1
      where id = $2 and balance_cents >= $1
      returning balance_cents`,
    [cents, from],
  );
  if (debit.rows.length === 0) {
    const exists = await conn.query('select 1 from accounts where id = $1', [from]);
    throw exists.rows.length > 0 ? new InsufficientFundsError(from) : new AccountNotFoundError(from);
  }

  const credit = await conn.query(
    'update accounts set balance_cents = balance_cents + $1 where id = $2 returning balance_cents',
    [cents, to],
  );
  if (credit.rows.length === 0) throw new AccountNotFoundError(to); // the debit is rolled back with it

  const inserted = await conn.query(
    'insert into transfers (from_id, to_id, cents) values ($1, $2, $3) returning id',
    [from, to, cents],
  );

  const response = {
    transferId: inserted.rows[0].id,
    fromBalanceCents: debit.rows[0].balance_cents,
    toBalanceCents: credit.rows[0].balance_cents,
  };
  // Same transaction as the money: either both exist or neither does.
  await conn.query(
    'insert into idempotency_keys (key, request, response) values ($1, $2::jsonb, $3::jsonb)',
    [key, JSON.stringify(request), JSON.stringify(response)],
  );
  return response;
}
