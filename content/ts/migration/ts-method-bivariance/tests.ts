import { dispatch, withDefaults } from './solution';
import type { AppEvent, ClickEvent, KeyEvent, Listener, Validator, Repository } from './solution';

// ---------- Listener ----------
const anyEvent = { handle: (e: AppEvent) => { const t: string = e.type; } };
const okListener: Listener = anyEvent;

const clickOnly = { handle: (e: ClickEvent) => { const x: number = e.x; } };
// @ts-expect-error a click-only handler would read e.x on a KeyEvent
const badListener: Listener = clickOnly;

class ClickLogger {
  handle(e: ClickEvent): void { const total: number = e.x + e.y; }
}
// @ts-expect-error a class method does not get around it either
const badClass: Listener = new ClickLogger();

declare const keyEvent: KeyEvent;
dispatch([okListener], keyEvent);

// ---------- Validator ----------
const nonEmpty: Validator<string> = { validate: (v) => (v.trim() === '' ? 'required' : null) };
// @ts-expect-error a string validator would call .trim() on a number
const loose: Validator<string | number> = nonEmpty;
const anything: Validator<unknown> = { validate: (v) => (v === undefined ? 'required' : null) };
const narrower: Validator<string> = anything;

// ---------- Repository ----------
declare const clickRepo: Repository<ClickEvent>;
// @ts-expect-error saving a KeyEvent into a click repository must not compile
const eventRepo: Repository<AppEvent> = clickRepo;
const clicks: ClickEvent[] = clickRepo.all();

// ---------- arrays ----------
type _wd = Expect<Equal<Parameters<typeof withDefaults>[0], readonly AppEvent[]>>;
type _dl = Expect<Equal<Parameters<typeof dispatch>[0], readonly Listener[]>>;
declare const clickEvents: ClickEvent[];
const all: AppEvent[] = withDefaults(clickEvents);
declare const frozen: readonly ClickEvent[];
withDefaults(frozen);
dispatch([] as readonly Listener[], keyEvent);
