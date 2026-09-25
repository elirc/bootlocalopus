import { selectFrom, handlersFor } from './solution';
import type { Exec } from './solution';

interface User { id: number; email: string; password_hash: string; created_at: string }
interface Post { id: number; title: string }
declare const exec: Exec;

// --- selectFrom: one explicit type argument, the columns inferred
const users = selectFrom<User>('users');
const rows = users(exec, 'id', 'email');
type _rows = Expect<Equal<typeof rows, Promise<Pick<User, 'id' | 'email'>[]>>>;

async function useIt() {
  const [first] = await selectFrom<User>('users')(exec, 'email');
  const email: string = first.email;
  // @ts-expect-error id was not selected
  first.id;
}

const titles = selectFrom<Post>('posts')(exec, 'title');
type _titles = Expect<Equal<typeof titles, Promise<Pick<Post, 'title'>[]>>>;

// @ts-expect-error not a column of Post
selectFrom<Post>('posts')(exec, 'email');
// @ts-expect-error exec must be the Exec function
selectFrom<Post>('posts')('select *', 'title');

// --- handlersFor: Events explicit, the handled subset inferred
type Events = {
  signup: { email: string };
  login: { id: number };
  logout: undefined;
};

const auth = handlersFor<Events>()({
  signup: (p) => {
    type _p = Expect<Equal<typeof p, { email: string }>>;
  },
  login: (p) => p.id.toFixed(0),
});

type _handles = Expect<Equal<typeof auth.handles, ('signup' | 'login')[]>>;

auth.dispatch('signup', { email: 'ada@example.com' });
auth.dispatch('login', { id: 7 });
// @ts-expect-error logout has no handler
auth.dispatch('logout', undefined);
// @ts-expect-error wrong payload for login
auth.dispatch('login', { id: '7' });
// @ts-expect-error payload for the wrong event
auth.dispatch('signup', { id: 7 });

// @ts-expect-error not an event
handlersFor<Events>()({ signup: () => {}, bogus: () => {} });
// @ts-expect-error handler parameter does not match the payload
handlersFor<Events>()({ login: (p: { id: string }) => {} });

// Handling nothing is allowed, and then nothing can be dispatched.
const none = handlersFor<Events>()({});
// @ts-expect-error nothing is handled
none.dispatch('signup', { email: 'x' });
