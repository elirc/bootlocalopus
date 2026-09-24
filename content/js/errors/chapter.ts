import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'js-errors',
  title: 'Errors You Can Act On',
  summary: 'Error classes, typed failures, and a fetch wrapper you would actually ship.',
  lessons: [
    {
      id: 'js-error-classes',
      title: 'Custom error classes',
      kind: 'js',
      xp: 65,
      why: '`throw new Error("failed")` gives your caller nothing to branch on. Error types are an API.',
      tags: ['errors', 'classes'],
      hints: [
        'Call `super(message, { cause: options.cause })` — the second argument is standard in modern JS and sets `error.cause`.',
        '`this.name = new.target.name` sets the name to the *concrete* subclass automatically, so subclasses do not each need a line.',
        'A `NotFoundError` constructor takes `(resource, id)` and builds the message itself before calling super.',
        'For `isRetryable`, `const status = error?.status; return status == null || status >= 500;`',
      ],
    },
    {
      id: 'js-resilient-client',
      title: 'BOSS: an API client you would ship',
      kind: 'js',
      xp: 200,
      boss: true,
      why: 'Every team writes this wrapper. Writing a correct one is a mid-level deliverable.',
      tags: ['async', 'errors', 'resilience', 'cancellation'],
      hints: [
        'Write one `request(method, path, { body, signal })` and have `get`/`post` delegate. Everything below lives in that one function.',
        'For a per-attempt timeout, `AbortSignal.timeout(timeoutMs)` plus `AbortSignal.any([callerSignal, timeoutSignal])` is the modern way. A manual `AbortController` with a `setTimeout` also works — just `clearTimeout` in a `finally`.',
        'Decide retryability before throwing: a 5xx or a thrown network/timeout error is retryable; a 4xx never is. If the caller\'s own signal aborted, do not retry.',
        'Read the body once. `const text = await res.text()`, then try `JSON.parse(text)` and fall back to the raw text — calling `res.json()` on an error response often throws on an HTML error page.',
        'Loop `for (let attempt = 0; attempt <= retries; attempt++)`, and only `await backoff(attempt + 1)` when you are actually going to try again — the loop index is 0-based, but the first retry is retry 1.',
      ],
    },
  ],
});
