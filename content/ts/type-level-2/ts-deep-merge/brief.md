`DeepPartial<Config>` is only half the job: something has to **apply** the
override at runtime. The usual hand-rolled `deepMerge` has three production
bugs:

1. It returns (or mutates) objects **shared with the defaults**, so one
   request's `config.db.pool.max = 999` changes the defaults for every request
   after it.
2. It merges *anything* that is `typeof 'object'` — so a `Date` or a `Money`
   instance in the override gets turned into a plain object and loses its
   methods.
3. It copies every key from untrusted JSON, including `__proto__`. That is
   **prototype pollution**: `JSON.parse('{"__proto__": {"isAdmin": true}}')`
   creates an own `__proto__` key, and `out[key] = …` with that key writes to
   `Object.prototype`, so every object in the process now has `isAdmin`.
   lodash, jQuery and hoek all shipped CVEs for exactly this.

This is a runtime lesson: the tests run your code.

## Task

Export:

**`isPlainObject(value)`** — `true` only for objects whose prototype is
`Object.prototype` or `null` (object literals, `JSON.parse` output,
`Object.create(null)`). `false` for arrays, `null`, `Date`, `Map`, class
instances and primitives.

**`deepMerge(base, override)`** — returns a **new** value:

- when both sides are plain objects, merge them key by key, recursively; keys
  only in `base` are kept, keys only in `override` are added;
- a value of `undefined` in the override is **ignored** (the base value
  stays), while `null` **overwrites**;
- anything else in the override — arrays, primitives, `null`, `Date`s, class
  instances — **replaces** the base value. Arrays are replaced whole, never
  merged by index;
- **isolation:** neither input is mutated, and the result shares **no plain
  object or array** with either input (copy them deeply). `Date`s and class
  instances are values and are kept by reference;
- the keys `__proto__`, `constructor` and `prototype` are **skipped**, at every
  depth, whether they come from the override or the base.

The starter's `DeepPartial` gives `deepMerge` its signature; the types are not
graded here.

Iterate with `Object.keys` (own, enumerable keys only), not `for…in`, and
write into a fresh `{}`.
