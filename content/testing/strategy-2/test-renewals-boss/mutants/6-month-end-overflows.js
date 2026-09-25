const PERIOD_MONTHS = { monthly: 1, annual: 12 };

/** `iso` moved on by `months` calendar months (UTC), clamped to the end of a shorter month. */
function addMonths(iso, months) {
  const d = new Date(iso);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const next = new Date(d);
  next.setUTCFullYear(year, month, d.getUTCDate());
  return next.toISOString();
}

/**
 * Charges every active subscription whose renewal is due, once each, and
 * reports what happened. One failed charge never stops the others.
 */
export async function renewDue(subscriptions, { now, charge }) {
  const at = now();
  const seen = new Set();
  const due = [];
  for (const sub of subscriptions) {
    if (seen.has(sub.id)) continue;
    seen.add(sub.id);
    if (sub.status === 'active' && Date.parse(sub.renewsAt) <= at) due.push(sub);
  }

  const renewed = [];
  const failed = [];
  for (const sub of due) {
    let result;
    try {
      result = await charge({
        customerId: sub.customerId,
        amountCents: sub.priceCents,
        idempotencyKey: `renew-${sub.id}-${sub.renewsAt}`,
      });
    } catch {
      result = { ok: false, reason: 'error' };
    }
    if (result.ok) renewed.push({ id: sub.id, renewsAt: addMonths(sub.renewsAt, PERIOD_MONTHS[sub.plan]) });
    else failed.push({ id: sub.id, reason: result.reason });
  }

  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { renewed: renewed.sort(byId), failed: failed.sort(byId) };
}
