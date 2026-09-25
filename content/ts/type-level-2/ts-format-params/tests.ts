import { format, createTranslator } from './solution';
import type { FormatParams, FormatArgs } from './solution';

type _f1 = Expect<Equal<FormatParams<'Hello {name}!'>, { name: string }>>;
type _f2 = Expect<Equal<
  FormatParams<'{name} has {count:number} new messages since {since:date}'>,
  { name: string; count: number; since: Date }
>>;
type _f3 = Expect<Equal<FormatParams<'{user} and {user} again'>, { user: string }>>;
type _f4 = Expect<Equal<FormatParams<'{id:string}'>, { id: string }>>;
type _f5 = Expect<Equal<FormatParams<'no placeholders here'>, {}>>;
type _f6 = Expect<Equal<FormatParams<'{a}{b}'>, { a: string; b: string }>>;
type _f7 = Expect<Equal<FormatParams<'total: {amount:money}'>, { amount: never }>>;

type _a1 = Expect<Equal<FormatArgs<'plain'>, []>>;
type _a2 = Expect<Equal<FormatArgs<'Hi {name}'>, [params: { name: string }]>>;

format('Hello {name}!', { name: 'Ada' });
format('{n:number} items', { n: 3 });
format('Just text');
// @ts-expect-error missing a param
format('Hello {name} from {city}', { name: 'Ada' });
// @ts-expect-error wrong param type
format('{n:number} items', { n: '3' });
// @ts-expect-error typo in the param name
format('Hello {name}!', { nmae: 'Ada' });
// @ts-expect-error no placeholders means no params object
format('Just text', {});
// @ts-expect-error placeholders mean the params are required
format('Hello {name}!');

const messages = {
  welcome: 'Welcome back, {name}!',
  inbox: 'You have {count:number} unread messages',
  renewal: 'Your plan renews on {date:date}',
  logout: 'You have been signed out',
} as const;

const t = createTranslator(messages);
t('welcome', { name: 'Ada' });
t('inbox', { count: 4 });
t('renewal', { date: new Date() });
t('logout');
// @ts-expect-error unknown message key
t('welcom', { name: 'Ada' });
// @ts-expect-error count must be a number
t('inbox', { count: 'four' });
// @ts-expect-error logout takes no params
t('logout', { name: 'Ada' });
// @ts-expect-error renewal needs a Date
t('renewal', { date: '2026-01-01' });
