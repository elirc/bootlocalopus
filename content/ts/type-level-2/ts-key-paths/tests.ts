import { get } from './solution';
import type { Paths, PathValue } from './solution';

interface Settings {
  theme: 'light' | 'dark';
  profile: {
    name: string;
    nickname?: string;
    address: { city: string; zip: string };
  };
  notifications?: { email: boolean; digest: 'daily' | 'weekly' };
  manager: { name: string } | null;
  tags: string[];
  createdAt: Date;
  save(): void;
  onChange?: (s: Settings) => void;
}

type _paths = Expect<Equal<Paths<Settings>,
  | 'theme'
  | 'profile' | 'profile.name' | 'profile.nickname' | 'profile.address' | 'profile.address.city' | 'profile.address.zip'
  | 'notifications' | 'notifications.email' | 'notifications.digest'
  | 'manager' | 'manager.name'
  | 'tags'
  | 'createdAt'
>>;
type _flat = Expect<Equal<Paths<{ a: number; b: string }>, 'a' | 'b'>>;
type _prim = Expect<Equal<Paths<string>, never>>;

type _v1 = Expect<Equal<PathValue<Settings, 'theme'>, 'light' | 'dark'>>;
type _v2 = Expect<Equal<PathValue<Settings, 'profile.address.city'>, string>>;
type _v3 = Expect<Equal<PathValue<Settings, 'profile.address'>, { city: string; zip: string }>>;
type _v4 = Expect<Equal<PathValue<Settings, 'tags'>, string[]>>;
type _v5 = Expect<Equal<PathValue<Settings, 'createdAt'>, Date>>;
// Optional or nullable parents make the leaf possibly undefined, exactly like `?.`
type _v6 = Expect<Equal<PathValue<Settings, 'notifications.email'>, boolean | undefined>>;
type _v7 = Expect<Equal<PathValue<Settings, 'manager.name'>, string | undefined>>;
type _v8 = Expect<Equal<PathValue<Settings, 'profile.nickname'>, string | undefined>>;
type _v9 = Expect<Equal<PathValue<Settings, 'notifications'>, { email: boolean; digest: 'daily' | 'weekly' } | undefined>>;

declare const s: Settings;
const city = get(s, 'profile.address.city');
type _g1 = Expect<Equal<typeof city, string>>;
const digest = get(s, 'notifications.digest');
type _g2 = Expect<Equal<typeof digest, 'daily' | 'weekly' | undefined>>;
// @ts-expect-error typo in a path
get(s, 'profile.adress.city');
// @ts-expect-error arrays are leaves
get(s, 'tags.0');
// @ts-expect-error methods are not paths
get(s, 'save');
// @ts-expect-error a trailing dot is not a path
get(s, 'profile.');
// @ts-expect-error cannot go below a primitive
get(s, 'theme.length');
