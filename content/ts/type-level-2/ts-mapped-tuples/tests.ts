import { allObject, settleObject, runAll } from './solution';
import type { AwaitedValues, TaskResults, SettledValues, Settled } from './solution';

interface User { id: string; name: string }
interface Order { id: string; totalCents: number }
declare function fetchUser(): Promise<User>;
declare function fetchOrders(): Promise<Order[]>;

// ---------- AwaitedValues ----------
type _o1 = Expect<Equal<
  AwaitedValues<{ user: Promise<User>; count: number; deep: Promise<Promise<boolean>> }>,
  { user: User; count: number; deep: boolean }
>>;
type _o2 = Expect<Equal<AwaitedValues<[Promise<1>, 'x']>, [1, 'x']>>;
type _o3 = Expect<Equal<AwaitedValues<{ maybe: Promise<string> | null }>, { maybe: string | null }>>;

// ---------- TaskResults ----------
type _t1 = Expect<Equal<TaskResults<[() => Promise<User>, () => number]>, [User, number]>>;
type _t2 = Expect<Equal<TaskResults<readonly [() => Promise<'a'>, () => 'b']>, ['a', 'b']>>;
type _t3 = Expect<Equal<TaskResults<[]>, []>>;
type _t4 = Expect<Equal<TaskResults<(() => Promise<number>)[]>, number[]>>;

// ---------- SettledValues ----------
type _s1 = Expect<Equal<
  SettledValues<{ user: Promise<User>; n: number }>,
  { user: Settled<User>; n: Settled<number> }
>>;

// ---------- allObject ----------
async function page() {
  const data = await allObject({ user: fetchUser(), orders: fetchOrders(), pageSize: 20 });
  type _a = Expect<Equal<typeof data, { user: User; orders: Order[]; pageSize: number }>>;
  const name: string = data.user.name;
  // @ts-expect-error the orders are already resolved: no .then on an array
  data.orders.then;

  // ---------- runAll keeps positions ----------
  const [user, orders, answer] = await runAll([() => fetchUser(), () => fetchOrders(), () => 42]);
  type _r1 = Expect<Equal<typeof user, User>>;
  type _r2 = Expect<Equal<typeof orders, Order[]>>;
  type _r3 = Expect<Equal<typeof answer, number>>;
  const all = await runAll([() => fetchUser(), async () => 'ok' as const]);
  type _r4 = Expect<Equal<typeof all, [User, 'ok']>>;
  const none = await runAll([]);
  type _r5 = Expect<Equal<typeof none, []>>;
  // @ts-expect-error a promise is not a task: pass a function that starts the work
  runAll([fetchUser()]);

  // ---------- settleObject ----------
  const settled = await settleObject({ user: fetchUser(), orders: fetchOrders() });
  if (settled.user.status === 'fulfilled') {
    const n: string = settled.user.value.name;
  } else {
    const why: unknown = settled.user.reason;
    // @ts-expect-error a rejected result has no value
    settled.user.value;
  }
  // @ts-expect-error must check the status before reading the value
  settled.orders.value.length;
}
