import slugify from 'slugify-legacy';
import { createClient, VERSION } from 'feature-flags-client';
import type { FlagClient } from 'feature-flags-client';
import logo from './assets/logo.svg';
import styles from './Button.module.css';

// --- slugify-legacy: a callable CommonJS export with properties
type _slugifyNotAny = ExpectFalse<IsAny<typeof slugify>>;
const s1: string = slugify('Hello World');
const s2: string = slugify('Hello World', { separator: '_', lower: false, strict: true });
// @ts-expect-error unknown option
slugify('Hello', { sep: '_' });
// @ts-expect-error text must be a string
slugify(42);
// @ts-expect-error slugify returns a string
const notNumber: number = slugify('x');
const sep: string = slugify.defaults.separator;
const lower: boolean = slugify.defaults.lower;
slugify.extend({ '♥': 'love' });
// @ts-expect-error the char map maps strings to strings
slugify.extend({ '♥': 1 });
const opts: slugify.Options = { lower: false };
type _extend = Expect<Equal<ReturnType<typeof slugify.extend>, void>>;

// --- feature-flags-client: named exports
type _clientNotAny = ExpectFalse<IsAny<ReturnType<typeof createClient>>>;
const client: FlagClient = createClient({ sdkKey: 'sdk-123', pollIntervalMs: 10_000 });
createClient({ sdkKey: 'sdk-123' });
// @ts-expect-error sdkKey is required
createClient({ pollIntervalMs: 1000 });
const version: string = VERSION;

const on: boolean = client.isEnabled('new-checkout');
client.isEnabled('new-checkout', { userId: 'u1', country: 'NZ', plan: 'pro', seats: 5, beta: true });
// @ts-expect-error attributes are primitives
client.isEnabled('new-checkout', { userId: 'u1', tags: ['a'] });
// @ts-expect-error userId is a string
client.isEnabled('new-checkout', { userId: 1 });
const colour: string = client.variant('button-colour', 'blue');

const off: () => void = client.on('update', (changed) => {
  type _changed = Expect<Equal<typeof changed, string[]>>;
});
client.on('error', (error) => {
  const message: string = error.message;
});
client.on('ready', () => {});
// @ts-expect-error ready passes no arguments
client.on('ready', (payload: string) => {});
// @ts-expect-error not an event this client emits
client.on('change', () => {});
const closing: Promise<void> = client.close();

// --- asset modules
type _logo = Expect<Equal<typeof logo, string>>;
const buttonClass: string = styles.button;
type _stylesNotAny = ExpectFalse<IsAny<typeof styles>>;
// @ts-expect-error class names are read-only
styles.button = 'x';

// --- build-time constants
type _version = Expect<Equal<typeof __APP_VERSION__, string>>;
type _dev = Expect<Equal<typeof __DEV__, boolean>>;
