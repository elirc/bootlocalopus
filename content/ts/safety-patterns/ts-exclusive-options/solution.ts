/** Keys of `B` that `A` lacks, marked optional-never: present is an error, absent is fine. */
type Without<A, B> = { [K in Exclude<keyof B, keyof A>]?: never };

/** Exactly one of two shapes. A plain `A | B` accepts an object with both. */
export type XOR<A, B> = (A & Without<A, B>) | (B & Without<B, A>);

/** At least one of the keys `K` is present (and not undefined); the rest of `T` is unchanged. */
export type RequireAtLeastOne<T, K extends keyof T = keyof T> = Omit<T, K> &
  { [P in K]-?: Required<Pick<T, P>> & Partial<Pick<T, Exclude<K, P>>> }[K];

/** Exactly one of the keys `K` is present; the others must be absent. */
export type RequireExactlyOne<T, K extends keyof T = keyof T> = Omit<T, K> &
  { [P in K]-?: Required<Pick<T, P>> & { [Q in Exclude<K, P>]?: never } }[K];

export type UserQuery = XOR<{ id: string }, { email: string }>;

export function describeQuery(query: UserQuery): string {
  // The `never` members make `query.id` readable on both branches, typed
  // `string | undefined`, so a plain comparison narrows.
  return query.id !== undefined ? `id=${query.id}` : `email=${query.email}`;
}

export type Schedule = { task: string } & XOR<{ at: Date }, { everyMinutes: number }>;

export function describeSchedule(schedule: Schedule): string {
  return schedule.at !== undefined
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
