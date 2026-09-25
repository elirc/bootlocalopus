"The page feels slow" is not a diagnosis. Before you add a single `memo`,
you need to know whether the time goes into React rendering, into the DOM,
into a network waterfall, or into one expensive function, and you need to
measure it in conditions that resemble production.

These questions are about the measuring: what the React Profiler tells you,
which numbers lie in development, and which optimisations pay for
themselves.
