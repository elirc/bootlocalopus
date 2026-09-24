import type {
  ApiClient, Endpoint, ResponseOf, BodyOf, GetEndpoint, PostEndpoint, User,
} from './solution';

type _endpoints = Expect<Equal<Endpoint, '/users' | '/users/:id' | '/users/create' | '/sessions'>>;
type _gets = Expect<Equal<GetEndpoint, '/users' | '/users/:id'>>;
type _posts = Expect<Equal<PostEndpoint, '/users/create' | '/sessions'>>;

type _resList = Expect<Equal<ResponseOf<'/users'>, User[]>>;
type _resOne = Expect<Equal<ResponseOf<'/users/:id'>, User>>;
type _resToken = Expect<Equal<ResponseOf<'/sessions'>, { token: string }>>;

type _bodyCreate = Expect<Equal<BodyOf<'/users/create'>, { name: string }>>;
type _bodyNone = Expect<Equal<BodyOf<'/users'>, never>>;

declare const api: ApiClient;

async function useIt() {
  // The response type follows from the endpoint string.
  const users = await api.get('/users');
  type _u = Expect<Equal<typeof users, User[]>>;
  const name: string = users[0].name;

  const one = await api.get('/users/:id');
  type _o = Expect<Equal<typeof one, User>>;

  const session = await api.post('/sessions', { email: 'a@b.c', password: 'hunter2' });
  type _s = Expect<Equal<typeof session, { token: string }>>;

  const created = await api.post('/users/create', { name: 'ada' });
  type _c = Expect<Equal<typeof created, User>>;

  // @ts-expect-error /users is a GET route
  await api.post('/users', { name: 'ada' });
  // @ts-expect-error /sessions is a POST route
  await api.get('/sessions');
  // @ts-expect-error no such endpoint
  await api.get('/unknown');
  // @ts-expect-error wrong body shape
  await api.post('/users/create', { nickname: 'ada' });
  // @ts-expect-error missing required body field
  await api.post('/sessions', { email: 'a@b.c' });
  // @ts-expect-error body is required
  await api.post('/users/create');
}
