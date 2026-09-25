const shape = (rows) => rows.map((r) => [
  r.team, num(r.tickets), num(r.open_tickets), num(r.responded),
  r.median_response_min === null ? null : num(r.median_response_min), num(r.breached),
]);
const byTeam = (rows) => Object.fromEntries(shape(rows).map((r) => [r[0], r]));
const teamId = async (name) => num((await q('select id from teams where name = $1', [name]))[0].id);
const addTicket = async (team, priority, createdAt) => num((await q(
  'insert into tickets (team_id, priority, created_at) values ($1, $2, $3) returning id',
  [await teamId(team), priority, createdAt],
))[0].id);
const addEvent = (ticket, kind, status, at) => q(
  'insert into ticket_events (ticket_id, kind, status, happened_at) values ($1, $2, $3, $4)',
  [ticket, kind, status, at],
);

describe('the report', () => {
  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(
      ['breached', 'median_response_min', 'open_tickets', 'responded', 'team', 'tickets'],
    );
  });

  it('has a row per team, including one with no tickets, and the total last', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.team)).toEqual(['Billing', 'Onboarding', 'Platform', 'All teams']);
  });

  it('gives a team with no tickets zeros and a null median', async () => {
    expect(byTeam(await queryUser()).Onboarding).toEqual(['Onboarding', 0, 0, 0, null, 0]);
  });

  it('counts tickets and open tickets from the latest status', async () => {
    const t = byTeam(await queryUser());
    expect(t.Billing.slice(0, 3)).toEqual(['Billing', 5, 3]);
    // Ticket 5 was resolved and then reopened; ticket 6 was resolved and
    // closed at the same instant, and the later event wins.
    expect(t.Platform.slice(0, 3)).toEqual(['Platform', 3, 1]);
  });

  it('uses the earliest agent reply and ignores customer replies', async () => {
    const t = byTeam(await queryUser());
    expect(t.Billing[3]).toBe(3);
    expect(t.Platform[3]).toBe(3);
    expect(t.Platform[4]).toBe(240);
  });

  it('computes medians over tickets, including on the total row', async () => {
    const t = byTeam(await queryUser());
    expect(t.Billing[4]).toBe(280);
    expect(t['All teams'][4]).toBe(245);
  });

  it('applies the breach rules at their boundaries', async () => {
    const t = byTeam(await queryUser());
    // Billing: ticket 2 (280 > 240) and ticket 3 (unanswered, deadline passed);
    // ticket 4 is unanswered but its deadline is still ahead.
    expect(t.Billing[5]).toBe(2);
    // Platform: ticket 7 (250 > 60); ticket 5 answered exactly on the deadline.
    expect(t.Platform[5]).toBe(1);
  });

  it('matches the full report', async () => {
    expect(shape(await queryUser())).toEqual([
      ['Billing', 5, 3, 3, 280, 2],
      ['Onboarding', 0, 0, 0, null, 0],
      ['Platform', 3, 1, 3, 240, 1],
      ['All teams', 8, 4, 6, 245, 3],
    ]);
  });
});

describe('against new data', () => {
  it('is reproducible: it does not depend on the clock', async () => {
    // A ticket created long ago, unanswered: breached as of the report time.
    await addTicket('Onboarding', 'normal', '2024-03-01 00:00+00');
    // Unanswered, but its deadline (12:59) is after the report time: with
    // now() as "now" this would count as breached.
    await addTicket('Onboarding', 'urgent', '2024-04-01 11:59+00');
    expect(byTeam(await q(userSql)).Onboarding).toEqual(['Onboarding', 2, 2, 0, null, 1]);
  });

  it('follows a late status change and an earlier reply inserted last', async () => {
    const id = await addTicket('Onboarding', 'high', '2024-04-01 06:00+00');
    await addEvent(id, 'agent_reply', null, '2024-04-01 11:00+00');
    await addEvent(id, 'status_change', 'closed', '2024-04-01 11:10+00');
    await addEvent(id, 'status_change', 'reopened', '2024-04-01 11:20+00');
    await addEvent(id, 'agent_reply', null, '2024-04-01 07:30+00');
    expect(byTeam(await q(userSql)).Onboarding).toEqual(['Onboarding', 1, 1, 1, 90, 0]);
  });

  it('keeps the total a true median over every ticket', async () => {
    const id = await addTicket('Onboarding', 'normal', '2024-04-01 00:00+00');
    await addEvent(id, 'agent_reply', null, '2024-04-01 00:10+00');
    const all = byTeam(await q(userSql))['All teams'];
    // Response minutes are now 10, 30, 45, 240, 250, 280, 290.
    expect(all).toEqual(['All teams', 9, 5, 7, 240, 3]);
  });
});
