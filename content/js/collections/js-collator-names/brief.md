`names.sort()` compares UTF-16 code units. That puts every capital letter
before every lowercase one (`"Zack"` before `"alice"`), every accented letter
after `z` (`"Émile"` at the very end), and `"Room 10"` before `"Room 2"`. It is
also wrong in a way no single rule can fix: a Swede expects `Å`, `Ä` and `Ö`
**after** `Z`, because they are separate letters of the Swedish alphabet, while a
German files `Ö` next to `O`.

The same goes for matching. Lowercasing and stripping accents
(`normalize('NFD').replace(/\p{M}/gu, '')`) makes `"o"` find `"Östberg"`, which
is right in German and wrong in Swedish.

`Intl.Collator` knows these rules for every locale. Two options do most of the
work: `numeric: true` compares digit runs as numbers, and `sensitivity: 'base'`
treats two strings as equal when they differ only in case or accents — as the
locale defines "accent".

## Task

Export three functions. `locale` is a BCP 47 tag such as `'en'`, `'de'` or
`'sv'`.

- `sortNames(names, locale)` → a **new** array sorted the way that locale
  sorts, with digit runs compared numerically (`'Room 2'` before `'Room 10'`).
  Do not mutate `names`.
- `sameName(a, b, locale)` → `true` when `a` and `b` differ at most in case and
  in what the locale considers accents: `sameName('José', 'jose', 'en')` is
  `true`; `sameName('Öberg', 'Oberg', 'sv')` is `false` because `Ö` is its own
  letter in Swedish; in German it is `true`.
- `filterByPrefix(names, query, locale)` → the names (in input order) whose
  first `query.length` characters are the **same name** as `query` under the
  rule above. An empty query matches every name.

A `Collator` is expensive to build and cheap to use: create one per locale and
options, not one per comparison (`a.localeCompare(b, locale)` builds one on
every call inside your sort).
