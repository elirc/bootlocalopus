const clockAt = (iso) => ({ now: () => new Date(iso) });
const fakeMailer = () => ({
  sent: [],
  async send(message) { this.sent.push(message); },
});
const invoice = (id, customerEmail, dueDate, paid = false) => ({ id, customerEmail, dueDate, paid });

/** Runs the job and returns what was sent, keyed by invoice id (order is not promised). */
async function run(invoices, now = '2024-03-10T09:00:00Z') {
  const mailer = fakeMailer();
  const ids = await solution.sendOverdueReminders({ invoices, clock: clockAt(now), mailer });
  const byInvoice = Object.fromEntries(mailer.sent.map((m) => [m.invoiceId, m]));
  return { ids: [...ids].sort(), sent: mailer.sent, byInvoice };
}

describe('sendOverdueReminders', () => {
  it('emails each overdue invoice to its own customer, with how late it is', async () => {
    const { sent, byInvoice } = await run([
      invoice('1', 'ada@example.com', '2024-03-01'),
      invoice('2', 'grace@example.com', '2024-03-08'),
    ]);
    expect(sent).toHaveLength(2);
    expect(byInvoice['1']).toEqual({ to: 'ada@example.com', invoiceId: '1', daysOverdue: 9 });
    expect(byInvoice['2']).toEqual({ to: 'grace@example.com', invoiceId: '2', daysOverdue: 2 });
  });

  it('resolves to the ids it reminded', async () => {
    const { ids } = await run([
      invoice('1', 'ada@example.com', '2024-03-01'),
      invoice('2', 'grace@example.com', '2024-03-20'),
      invoice('3', 'linus@example.com', '2024-02-01'),
    ]);
    expect(ids).toEqual(['1', '3']);
  });

  it('never reminds a paid invoice', async () => {
    const { sent, ids } = await run([invoice('1', 'ada@example.com', '2024-01-01', true)]);
    expect(sent).toEqual([]);
    expect(ids).toEqual([]);
  });

  describe('the due-date boundary', () => {
    it('is not overdue on the due date itself', async () => {
      const { sent } = await run([invoice('1', 'ada@example.com', '2024-03-10')], '2024-03-10T23:59:00Z');
      expect(sent).toEqual([]);
    });

    it('is one day overdue the day after', async () => {
      const { byInvoice } = await run([invoice('1', 'ada@example.com', '2024-03-10')], '2024-03-11T00:01:00Z');
      expect(byInvoice['1'].daysOverdue).toBe(1);
    });
  });

  it('sends one email when the same invoice appears twice', async () => {
    const dup = invoice('7', 'ada@example.com', '2024-03-01');
    const { sent } = await run([dup, { ...dup }]);
    expect(sent).toHaveLength(1);
  });

  it('uses the injected clock, not the real one', async () => {
    // Overdue by today's real date, but not by the clock we pass in.
    const { sent } = await run([invoice('1', 'ada@example.com', '2020-06-15')], '2020-06-01T12:00:00Z');
    expect(sent).toEqual([]);
  });
});
