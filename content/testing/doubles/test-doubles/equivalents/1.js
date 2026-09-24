// Same behaviour: de-duplicate first, walk the list newest-first, and send in parallel.
const DAY_MS = 86_400_000;

export async function sendOverdueReminders({ invoices, clock, mailer }) {
  const now = clock.now().getTime();
  const daysLate = (invoice) => Math.floor(now / DAY_MS) - Math.floor(Date.parse(invoice.dueDate) / DAY_MS);

  const unique = new Map();
  for (const invoice of invoices) if (!unique.has(invoice.id)) unique.set(invoice.id, invoice);

  const due = [...unique.values()]
    .filter((invoice) => !invoice.paid && daysLate(invoice) >= 1)
    .reverse();

  await Promise.all(
    due.map((invoice) => mailer.send({ invoiceId: invoice.id, to: invoice.customerEmail, daysOverdue: daysLate(invoice) })),
  );
  return due.map((invoice) => invoice.id);
}
