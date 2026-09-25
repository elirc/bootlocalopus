export type Job = () => Promise<void>;

const registry = new Set<{ job: Job; options: object }>();

/** TODO: exactly one of T's keys may be present. */
export type ExactlyOne<T extends object> = Partial<T>;

export interface RetryPolicy {
  attempts: number;
  delayMs: number;
}

// TODO: the "bag of optionals" every scheduler starts with. It accepts
// { at, cron } together, { timezone } on an interval, and { } with no trigger.
export type ScheduleOptions = {
  name: string;
  at?: Date;
  everyMs?: number;
  cron?: string;
  timezone?: string;
  jitterMs?: number;
  retry?: boolean | Partial<RetryPolicy>;
};

export type OnceOptions = ScheduleOptions;
export type IntervalOptions = ScheduleOptions;
export type CronOptions = ScheduleOptions;

export interface OneShotHandle {
  kind: 'once';
  cancel(): void;
}

export interface RecurringHandle {
  kind: 'recurring';
  stop(): void;
  nextRunAt(): Date;
}

// TODO: the return type should follow the trigger.
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
