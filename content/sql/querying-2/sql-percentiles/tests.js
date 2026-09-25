const shape = (rows) => rows.map((r) => [
  r.endpoint, num(r.requests), num(r.p50_ms), num(r.p95_ms), num(r.max_ms), num(r.error_rate),
]);

describe('latency report', () => {
  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort())
      .toEqual(['endpoint', 'error_rate', 'max_ms', 'p50_ms', 'p95_ms', 'requests']);
  });

  it('leaves out endpoints with fewer than 5 requests', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.endpoint)).not.toContain('GET /health');
    expect(rows).toHaveLength(3);
  });

  it('computes the interpolated median, not the average', async () => {
    const rows = shape(await queryUser());
    const byName = Object.fromEntries(rows.map((r) => [r[0], r]));
    expect(byName['GET /users'][2]).toBe(15.5);
    expect(byName['POST /orders'][2]).toBe(107.5);
    expect(byName['GET /search'][2]).toBe(125);
  });

  it('computes p95 as an observed value', async () => {
    const rows = shape(await queryUser());
    const byName = Object.fromEntries(rows.map((r) => [r[0], r]));
    expect(byName['GET /users'][3]).toBe(250);
    expect(byName['POST /orders'][3]).toBe(300);
    expect(byName['GET /search'][3]).toBe(210);
  });

  it('computes the error rate as a fraction rounded to 3 places', async () => {
    const rows = shape(await queryUser());
    const byName = Object.fromEntries(rows.map((r) => [r[0], r]));
    expect(byName['GET /users'][5]).toBe(0.1);
    expect(byName['POST /orders'][5]).toBe(0.333);
    expect(byName['GET /search'][5]).toBe(0.05);
  });

  it('matches the full expected report, ordered by p95 desc', async () => {
    expect(shape(await queryUser())).toEqual([
      ['POST /orders', 6, 107.5, 300, 300, 0.333],
      ['GET /users', 10, 15.5, 250, 250, 0.1],
      ['GET /search', 20, 125, 210, 220, 0.05],
    ]);
  });
});

describe('against new data', () => {
  it('includes an endpoint once it reaches 5 requests', async () => {
    await q("insert into request_logs (endpoint, status, duration_ms) values ('GET /health', 200, 3)");
    const rows = shape(await q(userSql));
    expect(rows[rows.length - 1]).toEqual(['GET /health', 5, 1, 3, 3, 0.2]);
  });

  it('breaks a p95 tie by endpoint name', async () => {
    await q(
      "insert into request_logs (endpoint, status, duration_ms) " +
      "select 'DELETE /orders', 200, 300 from generate_series(1, 5)",
    );
    const rows = shape(await q(userSql));
    expect(rows.slice(0, 2).map((r) => r[0])).toEqual(['DELETE /orders', 'POST /orders']);
  });
});
