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

export function parseWebhook(body: unknown): WebhookResult {
  // TODO: this trusts the sender completely.
  const raw = body as { id: string; type: string; created: number; data: Record<string, never> };
  return { ok: true, event: { ...raw.data, type: raw.type, id: raw.id, createdAt: new Date(raw.created) } as WebhookEvent };
}

export function describeEvent(event: WebhookEvent): string {
  // TODO
  return event.type;
}
