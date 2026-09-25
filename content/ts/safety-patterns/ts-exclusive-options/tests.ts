import { describeQuery, describeSchedule } from './solution';
import type { XOR, RequireAtLeastOne, RequireExactlyOne, UserQuery, Schedule, Contact, Payment } from './solution';

// --- XOR: one shape or the other, never both, never neither
describeQuery({ id: 'u1' });
describeQuery({ email: 'ada@example.com' });
// @ts-expect-error both: which one wins is anyone's guess
describeQuery({ id: 'u1', email: 'ada@example.com' });
// @ts-expect-error neither
describeQuery({});
// @ts-expect-error wrong type
describeQuery({ id: 1 });

declare const query: UserQuery;
if (query.id !== undefined) {
  const id: string = query.id;
} else {
  const email: string = query.email;
}

type AorB = XOR<{ a: number }, { b: string }>;
const onlyA: AorB = { a: 1 };
const onlyB: AorB = { b: 'x' };
// @ts-expect-error both
const both: AorB = { a: 1, b: 'x' };
// Shared keys are allowed on both sides.
type WithShared = XOR<{ kind: string; a: number }, { kind: string; b: number }>;
const shared: WithShared = { kind: 'k', a: 1 };

// --- XOR combined with required fields
describeSchedule({ task: 'report', at: new Date() });
describeSchedule({ task: 'cleanup', everyMinutes: 60 });
// @ts-expect-error once AND repeating
describeSchedule({ task: 'report', at: new Date(), everyMinutes: 5 });
// @ts-expect-error when?
describeSchedule({ task: 'report' });
// @ts-expect-error what?
describeSchedule({ everyMinutes: 5 });

// --- RequireAtLeastOne: one or more of the listed keys
const byEmail: Contact = { name: 'Ada', email: 'ada@example.com' };
const byPhone: Contact = { name: 'Ada', phone: '+64 21 000' };
const byBoth: Contact = { name: 'Ada', email: 'ada@example.com', phone: '+64 21 000' };
// @ts-expect-error no way to reach them
const unreachable: Contact = { name: 'Ada' };
// @ts-expect-error undefined does not count as present
const sneaky: Contact = { name: 'Ada', email: undefined };
// @ts-expect-error the other fields are unchanged: name is still required
const nameless: Contact = { email: 'ada@example.com' };

type _atLeastGeneric = RequireAtLeastOne<{ x?: number; y?: number }>;
const gx: _atLeastGeneric = { x: 1 };
// @ts-expect-error neither
const gnone: _atLeastGeneric = {};

// --- RequireExactlyOne: one payment method, not two
const card: Payment = { amountCents: 1999, cardToken: 'tok_123' };
const paypal: Payment = { amountCents: 1999, paypalId: 'pp_1' };
// @ts-expect-error two payment methods
const twoMethods: Payment = { amountCents: 1999, cardToken: 'tok_123', iban: 'NZ00' };
// @ts-expect-error no payment method
const noMethod: Payment = { amountCents: 1999 };
// @ts-expect-error the amount is still required
const noAmount: Payment = { cardToken: 'tok_123' };

type OneOf = RequireExactlyOne<{ a?: string; b?: string; c?: string }>;
const oneOf: OneOf = { c: 'x' };
// @ts-expect-error two of them
const twoOf: OneOf = { a: 'x', c: 'y' };
