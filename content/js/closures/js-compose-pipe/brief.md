Composition turns a pile of small functions into one pipeline. Express
middleware, Redux enhancers, and unified/rehype plugins are all this idea.

## Task

Export:

- `pipe(...fns)` — left to right: `pipe(a, b)(x) === b(a(x))`
- `compose(...fns)` — right to left: `compose(a, b)(x) === a(b(x))`
- `pipeAsync(...fns)` — left to right, awaiting each step, so a mix of sync
  and async functions works

With no functions, all three return the input unchanged. The first function
should receive every argument passed to the pipeline.