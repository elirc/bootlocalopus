/**
 * A specification is a named business rule you can combine, evaluate and —
 * the reason to bother — ask *why* it failed.
 */
class Specification {
  #name;
  #evaluate; // candidate -> { satisfied, failed }

  constructor(name, evaluate) {
    this.#name = name;
    this.#evaluate = evaluate;
    Object.freeze(this);
  }

  get name() { return this.#name; }

  explain(candidate) { return this.#evaluate(candidate); }
  isSatisfiedBy(candidate) { return this.#evaluate(candidate).satisfied; }
  select(candidates) { return candidates.filter((c) => this.isSatisfiedBy(c)); }

  and(other) { return all(this, other); }
  or(other) { return any(this, other); }

  not() {
    return new Specification(`not ${this.#name}`, (candidate) => {
      const satisfied = !this.isSatisfiedBy(candidate);
      return { satisfied, failed: satisfied ? [] : [`not ${this.#name}`] };
    });
  }
}

export function spec(name, predicate) {
  if (typeof name !== 'string' || name === '') throw new TypeError('A specification needs a name');
  if (typeof predicate !== 'function') throw new TypeError('A specification needs a predicate');
  return new Specification(name, (candidate) => {
    const satisfied = Boolean(predicate(candidate));
    return { satisfied, failed: satisfied ? [] : [name] };
  });
}

const names = (specs, joiner) => (specs.length === 1 ? specs[0].name : `(${specs.map((s) => s.name).join(` ${joiner} `)})`);

/** Every child is evaluated, so the explanation lists every reason, not just the first. */
export function all(...specs) {
  if (specs.length === 0) throw new TypeError('all() needs at least one specification');
  return new Specification(names(specs, 'and'), (candidate) => {
    const results = specs.map((s) => s.explain(candidate));
    const satisfied = results.every((r) => r.satisfied);
    return { satisfied, failed: satisfied ? [] : results.flatMap((r) => r.failed) };
  });
}

export function any(...specs) {
  if (specs.length === 0) throw new TypeError('any() needs at least one specification');
  return new Specification(names(specs, 'or'), (candidate) => {
    const results = specs.map((s) => s.explain(candidate));
    const satisfied = results.some((r) => r.satisfied);
    return { satisfied, failed: satisfied ? [] : results.flatMap((r) => r.failed) };
  });
}

// ---- the business rules, built from the primitives ---------------------------

export const isMember = spec('member', (c) => c.membership === 'active');
export const hasOrderedAtLeast = (n) => spec(`ordered-at-least-${n}`, (c) => c.orderCount >= n);
export const livesIn = (country) => spec(`lives-in-${country}`, (c) => c.country === country);
export const isFlagged = spec('flagged', (c) => c.fraudFlags.length > 0);

export const freeDelivery = livesIn('GB')
  .and(isMember.or(hasOrderedAtLeast(3)))
  .and(isFlagged.not());
