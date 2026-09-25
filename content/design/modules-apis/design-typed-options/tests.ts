import {
  schedule,
  type ExactlyOne,
  type ScheduleOptions,
  type OneShotHandle,
  type RecurringHandle,
} from './solution';

const job = async () => {};

// --- the return type follows the trigger -----------------------------------
const once = schedule(job, { name: 'send-reminder', at: new Date('2030-01-01') });
type _once = Expect<Equal<typeof once, OneShotHandle>>;

const every = schedule(job, { name: 'poll-inbox', everyMs: 30_000 });
type _every = Expect<Equal<typeof every, RecurringHandle>>;

const cron = schedule(job, { name: 'nightly-report', cron: '0 3 * * *', timezone: 'Europe/London' });
type _cron = Expect<Equal<typeof cron, RecurringHandle>>;

once.cancel();
every.stop();
const next: Date = cron.nextRunAt();

// @ts-expect-error a one-shot job cannot be stopped, only cancelled
once.stop();
// @ts-expect-error a recurring job has no cancel()
every.cancel();

// --- exactly one trigger ------------------------------------------------------
// @ts-expect-error two triggers: which one wins?
schedule(job, { name: 'ambiguous', at: new Date(), cron: '* * * * *' });
// @ts-expect-error interval and cron together
schedule(job, { name: 'ambiguous', everyMs: 1000, cron: '* * * * *' });
// @ts-expect-error no trigger at all
schedule(job, { name: 'never-runs' });

// Excess-property checks only apply to fresh object literals. This one is not.
const built = { name: 'built-elsewhere', at: new Date(), everyMs: 1000 };
// @ts-expect-error still two triggers
schedule(job, built);

// --- options that only make sense with some triggers -----------------------
// @ts-expect-error timezone only means something for cron
schedule(job, { name: 'tz', everyMs: 1000, timezone: 'UTC' });
// @ts-expect-error timezone on a one-shot
schedule(job, { name: 'tz', at: new Date(), timezone: 'UTC' });
// @ts-expect-error jitter spreads recurring runs; a one-shot has none
schedule(job, { name: 'jitter', at: new Date(), jitterMs: 500 });
schedule(job, { name: 'jitter', everyMs: 1000, jitterMs: 500 });
schedule(job, { name: 'jitter', cron: '*/5 * * * *', jitterMs: 500, timezone: 'UTC' });

// --- retry: off, or a complete policy ---------------------------------------
schedule(job, { name: 'r1', everyMs: 1000, retry: false });
schedule(job, { name: 'r2', at: new Date(), retry: { attempts: 3, delayMs: 200 } });
// @ts-expect-error a policy needs its delay
schedule(job, { name: 'r3', everyMs: 1000, retry: { attempts: 3 } });
// @ts-expect-error `true` is not a policy
schedule(job, { name: 'r4', everyMs: 1000, retry: true });
// @ts-expect-error name is required
schedule(job, { everyMs: 1000 });

// --- options the compiler has not narrowed -----------------------------------
declare const fromConfig: ScheduleOptions;
const unknownKind = schedule(job, fromConfig);
type _union = Expect<Equal<typeof unknownKind, OneShotHandle | RecurringHandle>>;
if (unknownKind.kind === 'recurring') unknownKind.stop();
else unknownKind.cancel();

// --- the reusable helper ------------------------------------------------------
type Contact = ExactlyOne<{ email: string; phone: string; postcode: string }>;
const byEmail: Contact = { email: 'ada@example.com' };
const byPhone: Contact = { phone: '+447700900001' };
// @ts-expect-error two at once
const both: Contact = { email: 'ada@example.com', phone: '+447700900001' };
// @ts-expect-error none
const neither: Contact = {};
// @ts-expect-error wrong type for the one given
const wrong: Contact = { postcode: 42 };
type _helperIsNotAny = ExpectFalse<IsAny<Contact>>;
