// Doubles: a stub clock (fixed time) and a fake mailer that records what it was asked to send.
const clockAt = (iso) => ({ now: () => new Date(iso) });
const fakeMailer = () => ({
  sent: [],
  async send(message) { this.sent.push(message); },
});
const invoice = (id, customerEmail, dueDate, paid = false) => ({ id, customerEmail, dueDate, paid });

describe('sendOverdueReminders', () => {
  it('reminds an unpaid invoice that is past due', async () => {
    const mailer = fakeMailer();
    await solution.sendOverdueReminders({
      invoices: [invoice('1', 'ada@example.com', '2024-03-01')],
      clock: clockAt('2024-03-10T09:00:00Z'),
      mailer,
    });
    expect(mailer.sent.length).toBe(1);
  });

  // TODO: who is the email to, and how late does it say? Paid invoices? The due date itself?
  // The same invoice twice? And a clock that disagrees with the real date.
});
