You turn on `strictNullChecks` and the directory module lights up with
errors: `Object is possibly 'undefined'`, `Type 'User | undefined' is not
assignable to type 'User'`. The fastest way to clear them is a `!` or an
`as User` on each line, and that is exactly how a migration keeps every bug it
was supposed to find. Each of these errors is the compiler asking a
**question**: *what should happen when this is missing?* The answer is a
product decision, and it is different for each function.

This lesson has **runtime** tests: they check the decision you made at every
place the compiler complained. (Type errors are not graded here, but every
function in the reference compiles under `strict` without `!` or `as`.)

## Task

Fix `createDirectory` in the starter. Its seven functions and their decisions:

| function | when something is missing |
| --- | --- |
| `find(id): User \| undefined` | say so in the type: return `undefined` |
| `get(id): User` | throw `new NotFoundError('User', id)` (given; message `User <id> not found`) |
| `managerName(id): string \| undefined` | `undefined` if the user is unknown, has no `managerId`, or the manager id does not exist |
| `emailDomain(id): string \| null` | unknown user: throw `NotFoundError` (use `get`). No `email`, or no `@` in it: `null`. Otherwise the text after the **last** `@` |
| `displayNames(ids): string[]` | skip unknown ids; keep the order (and duplicates) of the rest |
| `isActive(id): boolean` | unknown user: `false`. `deactivatedAt` missing **or `null`**: active. A `Date`: inactive |
| `initials(id): string` | unknown user: throw `NotFoundError`. First letter of each word, uppercased, where words are split on spaces and **empty words are ignored**; if that gives nothing, `'?'` |

The trap in `initials`: `''[0]` is `undefined`, and without
`noUncheckedIndexedAccess` the compiler does not warn you about it. `'  mary'.split(' ')`
contains empty strings, so the legacy code crashes on double spaces and on an
empty name.
