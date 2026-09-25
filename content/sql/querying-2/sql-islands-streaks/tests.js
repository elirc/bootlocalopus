const shape = (rows) => rows.map((r) => [r.name, r.streak_start, r.streak_end, num(r.days)]);
const userId = async (name) => num((await q('select id from users where name = $1', [name]))[0].id);

describe('streaks', () => {
  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['days', 'name', 'streak_end', 'streak_start']);
  });

  it("splits Ada's activity into three streaks despite the duplicate day", async () => {
    const ada = shape(await queryUser()).filter((r) => r[0] === 'Ada');
    expect(ada).toEqual([
      ['Ada', '2024-03-01', '2024-03-03', 3],
      ['Ada', '2024-03-05', '2024-03-06', 2],
      ['Ada', '2024-03-10', '2024-03-10', 1],
    ]);
  });

  it('runs across a month end and across midnight UTC', async () => {
    const bob = shape(await queryUser()).filter((r) => r[0] === 'Bob');
    expect(bob).toEqual([['Bob', '2024-02-28', '2024-03-02', 4]]);
  });

  it('counts a busy single day as a streak of 1', async () => {
    const chen = shape(await queryUser()).filter((r) => r[0] === 'Chen');
    expect(chen).toEqual([['Chen', '2024-03-04', '2024-03-04', 1]]);
  });

  it('leaves out users with no activity and orders by name, start', async () => {
    const rows = shape(await queryUser());
    expect(rows.map((r) => `${r[0]} ${r[1]}`)).toEqual([
      'Ada 2024-03-01', 'Ada 2024-03-05', 'Ada 2024-03-10', 'Bob 2024-02-28', 'Chen 2024-03-04',
    ]);
  });
});

describe('against new data', () => {
  it('joins two streaks when the gap between them is filled', async () => {
    await q("insert into activity (user_id, happened_at) values ($1, '2024-03-04 18:00+00')", [await userId('Ada')]);
    const ada = shape(await q(userSql)).filter((r) => r[0] === 'Ada');
    expect(ada).toEqual([
      ['Ada', '2024-03-01', '2024-03-06', 6],
      ['Ada', '2024-03-10', '2024-03-10', 1],
    ]);
  });

  it('keeps users apart even when their days interleave', async () => {
    const dara = await userId('Dara');
    await q(
      "insert into activity (user_id, happened_at) values ($1, '2024-03-02 12:00+00'), ($1, '2024-03-03 12:00+00'), ($1, '2024-03-03 13:00+00'), ($1, '2024-03-05 12:00+00')",
      [dara],
    );
    const rows = shape(await q(userSql)).filter((r) => r[0] === 'Dara');
    expect(rows).toEqual([
      ['Dara', '2024-03-02', '2024-03-03', 2],
      ['Dara', '2024-03-05', '2024-03-05', 1],
    ]);
  });
});
