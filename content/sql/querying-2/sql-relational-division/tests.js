const shape = (rows) => rows.map((r) => [r.name, r.role, num(r.required), num(r.missing), r.compliant]);
const empId = async (name) => num((await q('select id from employees where name = $1', [name]))[0].id);

describe('compliance report', () => {
  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['compliant', 'missing', 'name', 'required', 'role']);
  });

  it('includes everyone, including roles with no requirements', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.name).sort()).toEqual(['Ada', 'Bob', 'Chen', 'Dara', 'Elif', 'Farid', 'Gus']);
  });

  it('does not let a retake count twice', async () => {
    const bob = shape(await queryUser()).find((r) => r[0] === 'Bob');
    expect(bob).toEqual(['Bob', 'engineer', 3, 1, false]);
  });

  it('does not let an optional course count', async () => {
    const chen = shape(await queryUser()).find((r) => r[0] === 'Chen');
    expect(chen).toEqual(['Chen', 'engineer', 3, 2, false]);
  });

  it('treats a role with nothing required as compliant', async () => {
    const farid = shape(await queryUser()).find((r) => r[0] === 'Farid');
    expect(farid).toEqual(['Farid', 'designer', 0, 0, true]);
  });

  it('matches the full report in the required order', async () => {
    expect(shape(await queryUser())).toEqual([
      ['Gus', 'engineer', 3, 3, false],
      ['Chen', 'engineer', 3, 2, false],
      ['Elif', 'support', 2, 2, false],
      ['Bob', 'engineer', 3, 1, false],
      ['Ada', 'engineer', 3, 0, true],
      ['Dara', 'support', 2, 0, true],
      ['Farid', 'designer', 0, 0, true],
    ]);
  });
});

describe('against new data', () => {
  it('makes Bob compliant when he completes the last one', async () => {
    await q("insert into completions (employee_id, training_id, completed_on) values ($1, 3, '2024-05-01')", [await empId('Bob')]);
    const bob = shape(await q(userSql)).find((r) => r[0] === 'Bob');
    expect(bob).toEqual(['Bob', 'engineer', 3, 0, true]);
  });

  it('makes everyone in a role non-compliant when a requirement is added', async () => {
    await q("insert into role_requirements (role, training_id) values ('support', 3)");
    const rows = shape(await q(userSql));
    expect(rows.find((r) => r[0] === 'Dara')).toEqual(['Dara', 'support', 3, 1, false]);
  });

  it('does not let three extra courses make up for one missing requirement', async () => {
    const elif = await empId('Elif');
    await q(
      "insert into completions (employee_id, training_id, completed_on) values ($1, 1, '2024-05-01'), ($1, 4, '2024-05-02'), ($1, 4, '2024-05-03'), ($1, 3, '2024-05-04')",
      [elif],
    );
    const row = shape(await q(userSql)).find((r) => r[0] === 'Elif');
    expect(row).toEqual(['Elif', 'support', 2, 1, false]);
  });
});
