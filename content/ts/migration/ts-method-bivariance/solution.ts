export interface AppEvent { type: string; at: number }
export interface ClickEvent extends AppEvent { type: 'click'; x: number; y: number }
export interface KeyEvent extends AppEvent { type: 'key'; key: string }

// Property syntax (`name: (arg) => R`) is checked strictly under `strictFunctionTypes`.
// Method syntax (`name(arg): R`) is exempt: its parameters are checked both ways (bivariantly).

export interface Listener {
  handle: (event: AppEvent) => void;
}

export interface Validator<T> {
  validate: (value: T) => string | null;
}

export interface Repository<T> {
  save: (item: T) => void;
  all: () => T[];
}

export function dispatch(listeners: readonly Listener[], event: AppEvent): void {
  for (const listener of listeners) listener.handle(event);
}

/** Returns a new array: a `ClickEvent[]` passed in is never given a non-click event. */
export function withDefaults(events: readonly AppEvent[]): AppEvent[] {
  return [...events, { type: 'tick', at: 0 }];
}
