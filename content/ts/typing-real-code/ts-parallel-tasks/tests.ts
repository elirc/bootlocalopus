import { parallel, all, settle } from './solution';
import type { Task, Settled, Results } from './solution';

interface User { id: string; name: string }
interface Post { title: string }
declare function fetchUser(): Promise<User>;
declare function fetchPosts(): Promise<Post[]>;
declare function countUnread(): Promise<number>;

// --- parallel: a record of tasks becomes a record of results
const page = parallel({ user: fetchUser, posts: () => fetchPosts(), unread: countUnread });
type _page = Expect<Equal<typeof page, Promise<{ user: User; posts: Post[]; unread: number }>>>;

async function render() {
  const { user, posts } = await parallel({ user: fetchUser, posts: fetchPosts });
  const name: string = user.name;
  const first: string | undefined = posts[0]?.title;
  // @ts-expect-error unread was not requested
  const { unread } = await parallel({ user: fetchUser });
}

// Async functions written inline work too.
const inline = parallel({ total: async () => 42, label: async () => 'x' });
type _inline = Expect<Equal<typeof inline, Promise<{ total: number; label: string }>>>;

// @ts-expect-error a task must return a promise
parallel({ n: () => 1 });
// @ts-expect-error a started promise is not a task: pass the function, not its result
parallel({ user: fetchUser() });

// --- all: tasks as arguments, results as a tuple in the same order
const pair = all(fetchUser, fetchPosts);
type _pair = Expect<Equal<typeof pair, Promise<[User, Post[]]>>>;
const none = all();
type _none = Expect<Equal<typeof none, Promise<[]>>>;
async function usePair() {
  const [user, posts] = await all(fetchUser, fetchPosts);
  const id: string = user.id;
  const n: number = posts.length;
}
// @ts-expect-error not a task
all(fetchUser, 'posts');

// --- settle: every task reported, failures included, and nothing is any
const report = settle({ user: fetchUser, unread: countUnread });
type _report = Expect<Equal<typeof report, Promise<{ user: Settled<User>; unread: Settled<number> }>>>;
async function useReport() {
  const r = await settle({ user: fetchUser });
  if (r.user.status === 'fulfilled') {
    const name: string = r.user.value.name;
  } else {
    type _reason = Expect<Equal<typeof r.user.reason, unknown>>;
    // @ts-expect-error no value on a rejection
    r.user.value;
  }
}

// --- the helper types are usable on their own
type _task = Expect<Equal<Task<User>, () => Promise<User>>>;
type _results = Expect<Equal<Results<{ a: Task<string>; b: Task<boolean> }>, { a: string; b: boolean }>>;
type _tupleResults = Expect<Equal<Results<[Task<string>, Task<number>]>, [string, number]>>;
