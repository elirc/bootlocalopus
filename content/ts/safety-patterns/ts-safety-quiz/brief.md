Every escape hatch in TypeScript — `!`, `as`, `any`, a `default` branch, a
shallow `readonly` — is a place where you tell the compiler to stop checking.
Each is sometimes the right call. The skill is knowing exactly what you gave
up, and which alternative keeps the check.

This quiz covers the judgement calls from this chapter that code cannot
grade: which exhaustiveness checks really fire when a variant is added, what
`as` does *not* check compared with an annotation or `satisfies`, how far
`readonly` and `Object.freeze` actually reach, and how to keep an `any` from
spreading.

Answer every question correctly to pass.
