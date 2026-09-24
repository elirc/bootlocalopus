`"strict": true` is where a tsconfig starts, not where it ends. Several of the
flags that catch the most real bugs are **not** part of `strict` — the array
read that is `undefined` at runtime, the optional property explicitly set to
`undefined` that clobbers a default, the type import that crashes Node's type
stripping at startup — and a few more exist because *how your code gets run*
changed: bundlers, Node running `.ts` files directly, and tools that emit
`.d.ts` files without a type checker.

Each question shows a snippet that compiles under plain `strict: true`. Your job
is to name the flag that turns the marked line into an error, and to know why a
team would want it to.

All answers were checked against TypeScript 5.9. Every question must be right
to pass.
