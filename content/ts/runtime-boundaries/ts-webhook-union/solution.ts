export type Currency = 'GBP' | 'EUR' | 'USD';

interface Envelope { id: string; createdAt: Date }

export type WebhookEvent =
  | (Envelope & { type: 'payment.succeeded'; paymentId: string; amountCents: number; currency: Currency })
  | (Envelope & { type: 'payment.failed'; paymentId: string; reason: string })
  | (Envelope & { type: 'refund.created'; refundId: string; paymentId: string; amountCents: number })
  | (Envelope & { type: 'unknown'; originalType: string });

export type WebhookResult =
  | { ok: true; event: WebhookEvent }
  | { ok: false; errors: string[] };

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Small checks that record `path: reason` and return the value, or undefined when it is wrong. */
class Checker {
  errors: string[] = [];
  constructor(private readonly obj: Rec, private readonly prefix: string) {}

  private fail(key: string, reason: string): undefined {
    this.errors.push(`${this.prefix}${key}: ${reason}`);
    return undefined;
  }
  string(key: string): string | undefined {
    const v = this.obj[key];
    return typeof v === 'string' && v !== '' ? v : this.fail(key, 'expected a non-empty string');
  }
  nullableString(key: string): string | null | undefined {
    const v = this.obj[key];
    return v === null || typeof v === 'string' ? v : this.fail(key, 'expected a string or null');
  }
  integer(key: string, min: number): number | undefined {
    const v = this.obj[key];
    if (Number.isSafeInteger(v) && (v as number) >= min) return v as number;
    return this.fail(key, min > 0 ? 'expected a positive integer' : 'expected a non-negative integer');
  }
  oneOf<T extends string>(key: string, allowed: readonly T[]): T | undefined {
    const v = this.obj[key];
    return typeof v === 'string' && (allowed as readonly string[]).includes(v)
      ? (v as T)
      : this.fail(key, `expected one of ${allowed.join(', ')}`);
  }
}

type DataParser = (data: Checker, envelope: Envelope) => WebhookEvent | undefined;

const PARSERS = new Map<string, DataParser>([
  ['payment.succeeded', (d, env) => {
    const paymentId = d.string('payment_id');
    const amountCents = d.integer('amount', 0);
    const currency = d.oneOf('currency', ['gbp', 'eur', 'usd'] as const);
    if (paymentId === undefined || amountCents === undefined || currency === undefined) return undefined;
    return { type: 'payment.succeeded', ...env, paymentId, amountCents, currency: currency.toUpperCase() as Currency };
  }],
  ['payment.failed', (d, env) => {
    const paymentId = d.string('payment_id');
    const reason = d.nullableString('failure_reason');
    if (paymentId === undefined || reason === undefined) return undefined;
    return { type: 'payment.failed', ...env, paymentId, reason: reason ?? 'unknown' };
  }],
  ['refund.created', (d, env) => {
    const refundId = d.string('refund_id');
    const paymentId = d.string('payment_id');
    const amountCents = d.integer('amount', 1);
    if (refundId === undefined || paymentId === undefined || amountCents === undefined) return undefined;
    return { type: 'refund.created', ...env, refundId, paymentId, amountCents };
  }],
]);

export function parseWebhook(body: unknown): WebhookResult {
  if (!isRecord(body)) return { ok: false, errors: ['body: expected an object'] };

  const top = new Checker(body, '');
  const id = top.string('id');
  const type = top.string('type');
  const created = top.integer('created', 1);
  if (id === undefined || type === undefined || created === undefined) return { ok: false, errors: top.errors };

  const envelope: Envelope = { id, createdAt: new Date(created * 1000) };
  const parse = PARSERS.get(type);
  // New event types appear without warning. Acknowledge them; do not fail the delivery.
  if (!parse) return { ok: true, event: { type: 'unknown', ...envelope, originalType: type } };

  if (!isRecord(body.data)) return { ok: false, errors: ['data: expected an object'] };
  const data = new Checker(body.data, 'data.');
  const event = parse(data, envelope);
  return event ? { ok: true, event } : { ok: false, errors: data.errors };
}

const money = (cents: number) => (cents / 100).toFixed(2);

export function describeEvent(event: WebhookEvent): string {
  switch (event.type) {
    case 'payment.succeeded': return `Payment ${event.paymentId} succeeded: ${money(event.amountCents)} ${event.currency}`;
    case 'payment.failed': return `Payment ${event.paymentId} failed: ${event.reason}`;
    case 'refund.created': return `Refund ${event.refundId} for ${event.paymentId}: ${money(event.amountCents)}`;
    case 'unknown': return `Ignored ${event.originalType}`;
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
