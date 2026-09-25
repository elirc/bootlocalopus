export type Job = () => Promise<void>;

const registry = new Set<{ job: Job; options: object }>();

/** Exactly one of T's keys may be present: every other key is typed `never`. */
export type ExactlyOne<T extends object> = {
  [K in keyof T]: Pick<T, K> & { [Other in Exclude<keyof T, K>]?: never };
}[keyof T];

export interface RetryPolicy {
  attempts: number;
  delayMs: number;
}

interface Common {
  name: string;
  retry?: false | RetryPolicy;
}

export type OnceOptions = Common & {
  at: Date;
  everyMs?: never;
  cron?: never;
  timezone?: never;
  jitterMs?: never;
};

export type IntervalOptions = Common & {
  everyMs: number;
  at?: never;
  cron?: never;
  timezone?: never;
  jitterMs?: number;
};

export type CronOptions = Common & {
  cron: string;
  at?: never;
  everyMs?: never;
  timezone?: string;
  jitterMs?: number;
};

export type ScheduleOptions = OnceOptions | IntervalOptions | CronOptions;

export interface OneShotHandle {
  kind: 'once';
  cancel(): void;
}

export interface RecurringHandle {
  kind: 'recurring';
  stop(): void;
  nextRunAt(): Date;
}

export function schedule(job: Job, options: OnceOptions): OneShotHandle;
export function schedule(job: Job, options: IntervalOptions | CronOptions): RecurringHandle;
export function schedule(job: Job, options: ScheduleOptions): OneShotHandle | RecurringHandle;
export function schedule(job: Job, options: ScheduleOptions): OneShotHandle | RecurringHandle {
  // Jobs live in a registry that a separate ticker drives; the handles only
  // need to take them out of it again.
  const entry = { job, options };
  registry.add(entry);
  if (options.at !== undefined) {
    return { kind: 'once', cancel: () => void registry.delete(entry) };
  }
  const everyMs = options.everyMs ?? 60_000; // a real cron parser would go here
  const startedAt = Date.now();
  return {
    kind: 'recurring',
    stop: () => void registry.delete(entry),
    nextRunAt: () => new Date(startedAt + everyMs * (Math.floor((Date.now() - startedAt) / everyMs) + 1)),
  };
}
