Under `strict`, the variable in `catch (e)` is `unknown`, and the usual fix is
`(e as Error).message`. That compiles and is wrong. JavaScript can throw
**anything**: a string from an old library, a `{ message, code }` object from
an SDK, `undefined` from a `Promise.reject()` with no argument. The cast
turns all of those into `undefined` in your logs, or into
`Cannot read properties of undefined` inside the error handler itself, which
hides the error you were trying to report.

`unknown` is the compiler telling the truth. Handle it once, in one helper,
and every `catch` in the codebase can use it.

This lesson has **runtime** tests.

## Task

Export three functions:

**`toError(value: unknown): Error`**

| thrown value | result |
| --- | --- |
| an `Error` (any subclass) | **the same object**, untouched |
| a string `s` | `new Error(s)` with `cause: s` |
| an object whose `message` is a **string** | `new Error(value.message)` with `cause: value` |
| anything else | `new Error('Non-error thrown: ' + description)` with `cause: value` |

The description is `JSON.stringify(value)`. When that **throws** (circular
objects, BigInts) or returns **`undefined`** (for `undefined` and symbols), use
`String(value)` instead. So `null` → `Non-error thrown: null`,
`{ code: 'E1' }` → `Non-error thrown: {"code":"E1"}`, `undefined` →
`Non-error thrown: undefined`, a circular object →
`Non-error thrown: [object Object]`. `toError` must never throw.

Every new Error gets its `cause` through the constructor
(`new Error(msg, { cause })`), so `cause` is an own property even when it is
`undefined`.

**`errorMessage(value: unknown): string`**: the `message` of `toError(value)`.

**`wrapError(context: string, value: unknown): Error`**: a **new** Error with
message `` `${context}: ${errorMessage(value)}` `` and `cause` set to the
**original** `value`, not the normalised one.

The trap is `{ message: 42 }`. A check like `'message' in value` accepts it and
produces an Error whose message is `'42'`, which tells nobody anything. Check
`typeof value.message === 'string'`.
