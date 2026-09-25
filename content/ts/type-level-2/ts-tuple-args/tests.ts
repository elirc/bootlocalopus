import { partial, bindAll } from './solution';
import type { DropFirst, Bound } from './solution';

// ---------- DropFirst ----------
type _d1 = Expect<Equal<DropFirst<[1, 2, 3]>, [2, 3]>>;
type _d2 = Expect<Equal<DropFirst<[string]>, []>>;
type _d3 = Expect<Equal<DropFirst<[]>, []>>;
type _d4 = Expect<Equal<DropFirst<[number, ...string[]]>, string[]>>;
type _d5 = Expect<Equal<DropFirst<readonly [boolean, 'x']>, ['x']>>;

// ---------- partial ----------
declare function sendEmail(from: string, to: string, subject: string, urgent: boolean): Promise<void>;

const fromSupport = partial(sendEmail, 'support@example.com');
type _p1 = Expect<Equal<Parameters<typeof fromSupport>, [to: string, subject: string, urgent: boolean]>>;
type _p2 = Expect<Equal<ReturnType<typeof fromSupport>, Promise<void>>>;

const toAlice = partial(sendEmail, 'support@example.com', 'alice@example.com');
type _p3 = Expect<Equal<Parameters<typeof toAlice>, [subject: string, urgent: boolean]>>;

const allFixed = partial(sendEmail, 'a', 'b', 'c', true);
type _p4 = Expect<Equal<Parameters<typeof allFixed>, []>>;

const none = partial(sendEmail);
type _p5 = Expect<Equal<Parameters<typeof none>, [from: string, to: string, subject: string, urgent: boolean]>>;

fromSupport('bob@example.com', 'Hi', false);
// @ts-expect-error missing an argument
fromSupport('bob@example.com', 'Hi');
// @ts-expect-error wrong type in a fixed argument
partial(sendEmail, 42);
// @ts-expect-error too many fixed arguments
partial(sendEmail, 'a', 'b', 'c', true, 'extra');
// @ts-expect-error wrong type in a later argument
toAlice('Hi', 'yes');

// ---------- bindAll ----------
interface Db { query(sql: string): Promise<unknown[]> }
interface Ctx { db: Db; userId: string }

const handlers = {
  getOrder: (ctx: Ctx, id: string) => ({ id, owner: ctx.userId }),
  cancel: async (ctx: Ctx, id: string, reason?: string): Promise<boolean> => true,
  whoAmI: (ctx: Ctx) => ctx.userId,
};

declare const ctx: Ctx;
const api = bindAll(ctx, handlers);
type _b1 = Expect<Equal<typeof api.getOrder, (id: string) => { id: string; owner: string }>>;
type _b2 = Expect<Equal<Parameters<typeof api.cancel>, [id: string, reason?: string]>>;
type _b3 = Expect<Equal<ReturnType<typeof api.cancel>, Promise<boolean>>>;
type _b4 = Expect<Equal<typeof api.whoAmI, () => string>>;
type _b5 = Expect<Equal<keyof typeof api, 'getOrder' | 'cancel' | 'whoAmI'>>;
type _bound = Expect<Equal<Bound<{ f: (c: number, x: string) => void }>, { f: (x: string) => void }>>;

api.cancel('o_1');
api.cancel('o_1', 'duplicate');
// @ts-expect-error the context is already bound
api.getOrder(ctx, 'o_1');
// @ts-expect-error unknown handler
api.refund('o_1');
// @ts-expect-error the context does not satisfy what a handler needs
bindAll({ userId: 'u1' }, handlers);
