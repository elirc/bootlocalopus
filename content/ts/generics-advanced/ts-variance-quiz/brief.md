Most of the time TypeScript's inference and assignability do what you mean.
The cases in this quiz are where they do not — and where they fail silently,
which is worse than failing loudly.

**Inference.** A type parameter collects *candidates* from every argument
position it appears in (unless marked `NoInfer`), then picks one; it does not
invent a union to make a call succeed. Contextual typing flows the other way:
a callback's parameters are typed from the function it is passed to, and an
empty literal (`{}`, `[]`) gives inference almost nothing to go on.

**Variance** answers: if `Dog` is assignable to `Animal`, is `Box<Dog>`
assignable to `Box<Animal>`?

- **Covariant** (yes): `T` only comes *out* — return types, readonly
  properties.
- **Contravariant** (reversed): `T` only goes *in* — function parameters.
- **Invariant** (neither): `T` goes in and out — a mutable property, or a
  function that takes and returns it.

TypeScript measures variance from the structure, with two deliberate holes for
convenience: **arrays** are treated as covariant even though they are mutable,
and parameters declared with **method syntax** (`save(item: T): void`) are
checked bivariantly even under `strictFunctionTypes`. Knowing where those holes
are is what lets you design APIs that do not fall into them.

Answer every question correctly to pass.
