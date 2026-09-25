// Each of these looks like it constrains the options, and none of them does:
// `{ id, email }` passes as a UserQuery, `{ name }` as a Contact, and a payment
// with two methods, or none, compiles.

// TODO: exactly one of two shapes.
export type XOR<A, B> = A | B;

// TODO: at least one of the keys K is present.
export type RequireAtLeastOne<T, K extends keyof T = keyof T> = T;

// TODO: exactly one of the keys K is present.
export type RequireExactlyOne<T, K extends keyof T = keyof T> = T;

export type UserQuery = XOR<{ id: string }, { email: string }>;

export function describeQuery(query: UserQuery): string {
  return 'id' in query ? `id=${query.id}` : `email=${query.email}`;
}

export type Schedule = { task: string } & XOR<{ at: Date }, { everyMinutes: number }>;

export function describeSchedule(schedule: Schedule): string {
  return 'at' in schedule
    ? `${schedule.task} once at ${schedule.at.toISOString()}`
    : `${schedule.task} every ${schedule.everyMinutes} min`;
}

export interface ContactFields {
  name: string;
  email?: string;
  phone?: string;
}
export type Contact = RequireAtLeastOne<ContactFields, 'email' | 'phone'>;

export interface PaymentFields {
  amountCents: number;
  cardToken?: string;
  paypalId?: string;
  iban?: string;
}
export type Payment = RequireExactlyOne<PaymentFields, 'cardToken' | 'paypalId' | 'iban'>;
