Every lesson in this chapter took a `conn` and trusted it to be one
connection. In a real service that connection comes from a **pool**, and
most database outages that are not a bad query are a pool problem: a
transaction whose statements went to three different connections, a client
never released on an error path, 40 app instances each opening 50
connections to a database that allows 100, a session stuck `idle in
transaction` holding locks while the code waits for an HTTP call.

This quiz covers the decisions around the pool. Facts you will need, in
node-postgres terms (other drivers are the same idea with other names):

- `pool.query(text, params)` checks out **any** idle connection, runs one
  statement, and returns the connection to the pool.
- `const client = await pool.connect()` checks out **one** connection for
  you to use for several statements; `client.release()` returns it. A
  client that is never released is gone from the pool for good.
- Postgres has a hard `max_connections` (100 by default), and each
  connection is a server process with its own memory. More connections is
  not more throughput past a small multiple of the CPU count.
- **PgBouncer** in *transaction* mode lends a server connection to a client
  for one transaction at a time, so a thousand app connections can share
  twenty server connections — at the price of anything that lives in a
  **session**.
- `statement_timeout` and `idle_in_transaction_session_timeout` make
  Postgres end a statement, or a session, that has run or idled too long.
