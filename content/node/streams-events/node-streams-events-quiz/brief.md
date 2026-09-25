Streams and event emitters are the two oldest abstractions in Node, and
their defaults were chosen before anyone had learned the lessons below.
`.pipe()` does not forward errors. An `'error'` event nobody listens to
crashes the process. `emit()` is synchronous. An object-mode buffer counts
objects, not bytes. Breaking out of a `for await` over a stream destroys it.

None of these are exotic: each one is a production incident that looks like
"the export sometimes leaves a file handle open" or "memory climbs during
imports". These questions are the judgement calls behind them.
