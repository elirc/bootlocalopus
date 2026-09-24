const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole UTC days since the epoch. */
const utcDay = (date) => Math.floor(date.getTime() / DAY_MS);

/**
 * Emails a reminder for every unpaid invoice that is past its due date.
 * Resolves to the ids that were reminded.
 */
export async function sendOverdueReminders({ invoices, clock, mailer }) {
  const today = utcDay(clock.now());
  const reminded = [];
  const seen = new Set();

  for (const invoice of invoices) {
    if (invoice.paid || seen.has(invoice.id)) continue;
    const daysOverdue = today - utcDay(new Date(invoice.dueDate));
    if (daysOverdue < 0) continue;

    seen.add(invoice.id);
    await mailer.send({ to: invoice.customerEmail, invoiceId: invoice.id, daysOverdue });
    reminded.push(invoice.id);
  }
  return reminded;
}
