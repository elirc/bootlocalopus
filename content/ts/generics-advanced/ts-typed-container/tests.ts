import { container, Container } from './solution';
import type { Deps } from './solution';

interface Config { dbUrl: string; port: number }
class Db {
  constructor(readonly url: string) {}
  query(sql: string): Promise<unknown[]> { return Promise.resolve([sql]); }
}
class UserRepo { constructor(readonly db: Db) {} }
class Mailer { send(to: string): void {} }
class SignupService { constructor(readonly users: UserRepo, readonly mailer: Mailer) {} }

const config: Config = { dbUrl: 'postgres://localhost/app', port: 3000 };

// --- each registration grows the type
const base = container()
  .value('config', config)
  .provide('db', ({ config }) => new Db(config.dbUrl))
  .provide('users', ({ db }) => new UserRepo(db))
  .provide('mailer', () => new Mailer())
  .provide('signup', ({ users, mailer }) => new SignupService(users, mailer));

type AppDeps = { config: Config; db: Db; users: UserRepo; mailer: Mailer; signup: SignupService };
type _deps = Expect<Equal<Deps<typeof base>, AppDeps>>;
type _depsNotAny = ExpectFalse<IsAny<Deps<typeof base>['db']>>;
type _base = Expect<Equal<typeof base, Container<AppDeps>>>;

const app = base.build();
type _app = Expect<Equal<typeof app, AppDeps>>;
const url: string = app.signup.users.db.url;

const empty = container();
type _empty = Expect<Equal<Deps<typeof empty>, {}>>;

// --- a factory sees exactly what was registered before it, with no annotations
container()
  .value('config', config)
  .provide('db', (deps) => {
    const port: number = deps.config.port;
    // @ts-expect-error db is not registered yet: no cycles, no use-before-provide
    deps.db;
    return new Db(deps.config.dbUrl);
  });

// @ts-expect-error db is registered after users
container().provide('users', ({ db }) => new UserRepo(db)).provide('db', () => new Db('x'));

// --- names are unique string literals
// @ts-expect-error db is already provided
base.provide('db', () => new Db('postgres://other'));
// @ts-expect-error config is already provided
base.value('config', config);
declare const dynamicName: string;
// @ts-expect-error a plain string would erase every name the type knows about
base.provide(dynamicName, () => 1);
// @ts-expect-error names are strings
container().value(42, 'x');

// --- builders are immutable: registering does not change the original
const withCache = base.provide('cache', () => new Map<string, string>());
type _cache = Expect<Equal<Deps<typeof withCache>['cache'], Map<string, string>>>;
type _baseUnchanged = Expect<Equal<Deps<typeof base>, AppDeps>>;

// --- override swaps a registered dependency for a fake of the same type
const testApp = base.override('mailer', () => ({ send: (to: string) => {} })).build();
type _testApp = Expect<Equal<typeof testApp, AppDeps>>;
// @ts-expect-error cache is not registered in base
base.override('cache', () => new Map());
// @ts-expect-error the fake must be a Mailer
base.override('mailer', () => ({ sent: [] as string[] }));
// @ts-expect-error overriding a Db with a UserRepo
base.override('db', () => app.users);
