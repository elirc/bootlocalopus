import { Repository, UserRepository, Money, FixedClock } from './solution';
import type { User, Clock, Entity } from './solution';

// --- the abstract base
// @ts-expect-error an abstract class cannot be instantiated
new Repository<User>();

const users = new UserRepository();
const saved: User = users.save({ id: 'u1', email: 'ada@example.com' });
const found = users.find('u1');
type _found = Expect<Equal<typeof found, User | undefined>>;
const byEmail = users.findByEmail('ada@example.com');
type _byEmail = Expect<Equal<typeof byEmail, User | undefined>>;
const everyone = users.all();
type _all = Expect<Equal<typeof everyone, readonly User[]>>;
// @ts-expect-error the list is a snapshot, not the storage
everyone.push(saved);
// @ts-expect-error storage is protected
users.items;
// @ts-expect-error validation is an internal step of save
users.validate(saved);
// @ts-expect-error users need an email
users.save({ id: 'u2' });

// A subclass must supply validate…
// @ts-expect-error non-abstract class does not implement validate
class PostRepository extends Repository<{ id: string; title: string }> {}

// …and can then use the protected storage.
class TagRepository extends Repository<{ id: string; label: string }> {
  protected validate(tag: { id: string; label: string }): void {
    if (tag.label === '') throw new Error('empty label');
  }
  labels(): string[] {
    return [...this.items.values()].map((t) => t.label);
  }
}
const labels: string[] = new TagRepository().labels();

// @ts-expect-error entities need a string id
class NoIdRepository extends Repository<{ name: string }> {
  protected validate(): void {}
}

// --- Money: one way in, nominal, immutable
const price = Money.fromCents(1999);
const total: Money = price.plus(Money.fromCents(1));
const cents: number = total.cents;
const same: boolean = total.equals(price);
// @ts-expect-error the constructor is private; use fromCents
new Money(5);
// @ts-expect-error cents is read-only
price.cents = 0;
// @ts-expect-error a look-alike object is not Money
const fake: Money = { cents: 5, plus: (other: Money) => other, equals: () => true };
// @ts-expect-error plus takes Money, not a number
price.plus(1);

// --- implements: the class is checked against the interface
const clock: Clock = new FixedClock(new Date('2024-01-01T00:00:00Z'));
const now: Date = clock.now();
// @ts-expect-error a FixedClock needs its instant
new FixedClock();
type _entity = Expect<Equal<Entity, { id: string }>>;
