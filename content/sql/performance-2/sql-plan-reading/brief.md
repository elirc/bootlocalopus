You will spend more time reading `EXPLAIN (ANALYZE, BUFFERS)` output than
writing it. The skill is not knowing every node type; it is knowing where
to look first and which numbers lie.

A cheat sheet for the questions that follow:

- Read a plan **inside out**: the most indented node runs first and feeds
  its parent.
- Each node shows `(cost=… rows=N …)` — the planner's **estimate** — and,
  with `ANALYZE`, `(actual time=A..B rows=N loops=L)` — what happened.
  `actual time` and `rows` are **per loop**: multiply by `loops` for the
  node's total.
- The single most useful comparison is **estimated rows versus actual
  rows**. When they differ by orders of magnitude, every decision above that
  node (join method, join order, memory) was made for a different query.
- `Rows Removed by Filter` is work done and thrown away.
- `Sort Method: external merge  Disk: …` means the sort did not fit in
  `work_mem` and spilled to disk.
- `Buffers: shared hit=H read=R`: `hit` pages came from Postgres's cache,
  `read` pages from the OS (and maybe the disk).
- A prepared statement (what most drivers use for parameterised queries)
  may, after a few executions, switch to a **generic plan** built without
  looking at the parameter values.
