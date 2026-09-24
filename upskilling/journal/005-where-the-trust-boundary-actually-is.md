# 005 — Where the trust boundary actually is

*2026-09-24 · Journal entry. Context: the grading sandbox was reviewed
(`reviews/01-sandbox-*.md`); the first pass showed a learner could forge a
passing grade three ways; the second pass argued about what the fix should
even mean. This entry is about that argument, because the code change was
small and the reasoning was not.*

## Context

Learner code runs in a `worker_thread`. The worker hosts the test harness
(`describe`, `it`, `expect`) as globals, imports the learner's module, imports
the lesson's spec, runs the tests, and posts a result object to the parent.
In v1 the parent read `ok` off that object.

Three one-liners in a "solution" produced `ok: true` with nothing solved:

1. `globalThis.expect = () => new Proxy({}, { get: () => () => {} })` — every
   assertion becomes a no-op.
2. `import { parentPort } from 'node:worker_threads'; parentPort.postMessage({
   ok: true, tests: [{ name: 'x', passed: true }] })` — post the verdict
   yourself.
3. `Array.prototype.every = () => true` — the harness computed `ok` with
   `results.every(...)`.

Also found: the worker inherited the server's `tsx` loader, so learner code
could `import('../../content/index.ts')` and read every reference solution;
the worker shared the server's PID, so `process.kill(process.pid)` took the
server down; and the memory limit did not cover `Buffer`s.

## The question that mattered

The first reviewer proposed: results on a private channel, harness globals
frozen, primordials captured. All correct. The second reviewer asked the
better question: *what is the trust boundary?* If learner code controls the
worker's globals, then anything the worker computes — including whether the
private channel was used honestly — is suspect. So either the boundary is
the worker (and the worker must be made trustworthy, which is a losing game
against arbitrary code), or the boundary is the **parent**, and the worker is
treated as a source of untrusted data.

The second is right, and it changes what "fixed" means:

- The parent never reads a verdict. It receives *rows* — one `{ name, passed,
  error }` per test — and derives `ok` itself: non-empty, every row passed,
  no run-level error. A worker that lies about `ok` is ignored; a worker that
  lies about *rows* has to lie consistently about every test, which the next
  point makes hard.
- Rows arrive on a `MessagePort` created by the parent and handed to the
  worker in `workerData`. The worker copies it into a module-scope constant
  and **deletes it from `workerData`** before any learner module loads. The
  ordinary `parentPort` is never read. Learner code that posts on
  `parentPort` is talking to nobody.
- The harness globals are defined non-writable and non-configurable *before*
  learner code loads. `globalThis.expect = …` throws in a module (strict
  mode). The `expect()` return objects come from a frozen prototype, so
  `expect(x).toBe = …` throws too.
- The small set of builtins the trusted core uses — `Array.prototype.every`,
  `Object.keys`, `hasOwnProperty`, `Date.now`, `JSON.stringify`, the port's
  `postMessage` — is captured into locals at module evaluation, before
  learner code exists. A patched prototype afterwards changes nothing the
  core does. Everything *outside* the core (matcher bodies, pretty-printing)
  may use ordinary methods, because a learner who breaks those only breaks
  their own run.
- `execArgv: []` — the worker is a bare Node, no `tsx` loader, so `.ts`
  curriculum files are unimportable. An import policy (via
  `module.registerHooks`) additionally denies `worker_threads`, `vm`,
  `child_process`, `module` and any `file:` URL outside the run directory
  and `node_modules`.
- `process.exit`, `kill`, `abort`, `chdir`, `dlopen`, `binding` are replaced
  with throwing stubs before learner code loads. Exiting is answered as a
  failure immediately rather than at the timeout.

## What we did *not* do, and why

We did not try to make the worker unbreakable. A determined learner on their
own machine can still, for instance, patch `Function.prototype.call` before
the harness captures anything — no, they cannot: capture happens at module
evaluation, and learner code runs later. But they can find some other
primitive we did not think of. The point is that it does not matter: the
parent derives the verdict from rows, and rows are per-test facts the
learner would have to fabricate one by one, in the shape the spec registered
(the worker sends the `plan` of test names before running any). The design
does not depend on the worker being honest; it depends on the parent being
sceptical.

This is a *local* app. The threat model is not an attacker; it is a learner
lying to themselves, and the value of the fix is that the app's claims about
progress stay true. Binding to loopback and checking the `Host` header
closes the one case where it is an attacker — someone on the same network
using the grader to run code on the learner's machine.

## The senior-level lesson

"Where is the trust boundary?" is the first question in any design where one
component runs another's code — plugins, webhooks, user scripts, an LLM's
tool calls. The instinct is to harden the untrusted side. The durable answer
is to make the trusted side derive its conclusions from evidence it can
check, and to make the untrusted side unable to *reach* the trusted side's
inputs. Every fix listed above is one of those two moves.

Second lesson, smaller: the forgery that had worried me least — patching
`Array.prototype.every` — was the one that produced the most misleading
output: `ok: true` with a red test visibly in the list. The bugs that look
silly are the ones that ship.
