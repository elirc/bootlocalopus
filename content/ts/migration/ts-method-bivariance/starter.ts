export interface AppEvent { type: string; at: number }
export interface ClickEvent extends AppEvent { type: 'click'; x: number; y: number }
export interface KeyEvent extends AppEvent { type: 'key'; key: string }

// `strict` is on, `strictFunctionTypes` is on, and all of these still let an
// unsafe assignment through.

export interface Listener {
  handle(event: AppEvent): void;
}

export interface Validator<T> {
  validate(value: T): string | null;
}

export interface Repository<T> {
  save(item: T): void;
  all(): T[];
}

export function dispatch(listeners: Listener[], event: AppEvent): void {
  for (const listener of listeners) listener.handle(event);
}

export function withDefaults(events: AppEvent[]): AppEvent[] {
  events.push({ type: 'tick', at: 0 });
  return events;
}
