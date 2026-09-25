// Same behaviour: charges run concurrently, in reverse input order, and the
// next renewal date is worked out with a different month calculation.
const MONTHS = { monthly: 1, annual: 12 };

function nextRenewal(iso, plan) {
  const d = new Date(iso);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + MONTHS[plan];
  const year = Math.floor(total / 12);
  const month = total % 12;
  const daysInMonth = 32 - new Date(Date.UTC(year, month, 32)).getUTCDate();
  const day = Math.min(d.getUTCDate(), daysInMonth);
  return new Date(Date.UTC(year, month, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())).toISOString();
}

export async function renewDue(subscriptions, { now, charge }) {
  const at = now();
  const unique = new Map();
  for (const sub of subscriptions) if (!unique.has(sub.id)) unique.set(sub.id, sub);
  const due = [...unique.values()].filter((s) => s.status === 'active' && new Date(s.renewsAt).getTime() <= at).reverse();

  const outcomes = await Promise.all(due.map(async (sub) => {
    try {
      const result = await charge({
        idempotencyKey: ['renew', sub.id, sub.renewsAt].join('-'),
        amountCents: sub.priceCents,
        customerId: sub.customerId,
      });
      return { sub, result };
    } catch {
      return { sub, result: { ok: false, reason: 'error' } };
    }
  }));

  const renewed = outcomes.filter((o) => o.result.ok).map(({ sub }) => ({ id: sub.id, renewsAt: nextRenewal(sub.renewsAt, sub.plan) }));
  const failed = outcomes.filter((o) => !o.result.ok).map(({ sub, result }) => ({ id: sub.id, reason: result.reason }));
  const cmp = (a, b) => (a.id === b.id ? 0 : a.id < b.id ? -1 : 1);
  return { renewed: renewed.sort(cmp), failed: failed.sort(cmp) };
}
