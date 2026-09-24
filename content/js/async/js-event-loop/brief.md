The runtime finishes all synchronous code, then drains the **microtask**
queue (promise callbacks, `queueMicrotask`), then takes **one macrotask**
(`setTimeout`, I/O), then drains microtasks again. In Node,
`process.nextTick` jumps ahead of promise microtasks.

Answer from the model, not from memory of a blog post.