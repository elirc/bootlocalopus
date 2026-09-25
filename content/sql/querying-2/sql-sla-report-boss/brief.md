The support lead wants the weekly SLA report, and the current one is a
spreadsheet assembled from four queries and a pivot table. Replace it with
**one query**. It needs most of this chapter: the latest status per ticket,
the first agent reply, deadlines from a policy table, a median, subtotals,
and teams that had no tickets at all.

The fixture:

- `teams(id, name)`
- `sla_policies(priority, first_response_minutes)` — `urgent` 60, `high` 240,
  `normal` 1440
- `tickets(id, team_id, priority, created_at)`
- `ticket_events(id, ticket_id, kind, status, happened_at)` where `kind` is
  `'agent_reply'`, `'customer_reply'` or `'status_change'` (only status
  changes have a `status`)

The report is as of **`2024-04-01 12:00:00+00`** — use that literal as "now",
never `now()`, or the numbers change every time it runs.

## Per-ticket definitions

- **First response**: the earliest `agent_reply` (by `happened_at`, which is
  not the insertion order). Customer replies are not responses.
- **Deadline**: `created_at` plus the priority's `first_response_minutes`.
- **Breached**: the first response came **after** the deadline, or there is
  no response yet and "now" is after the deadline. A response exactly at the
  deadline is on time; an unanswered ticket whose deadline has not passed yet
  is not breached.
- **Current status**: the `status` of the latest `status_change` (by
  `happened_at`, then by the greater `id` when two share a time). A ticket
  with no status change is `'open'`.
- **Open**: the current status is anything other than `'resolved'` or
  `'closed'`.
- **Response minutes**: minutes from `created_at` to first response.

## Task

One query, one row per team **plus a total row**:

| column | value |
| --- | --- |
| `team` | the team name; `'All teams'` on the total row |
| `tickets` | number of tickets (integer) |
| `open_tickets` | number of open tickets (integer) |
| `responded` | tickets with a first response (integer) |
| `median_response_min` | median (`percentile_cont(0.5)`) of response minutes over responded tickets, rounded to 1 decimal; `NULL` when none |
| `breached` | breached tickets (integer) |

Every team appears, including one with no tickets (zeros and a `NULL`
median). Order by team name, with the total row last. The total row is
computed over all tickets — a median of medians is not a median — so use
`ROLLUP`/`GROUPING SETS` rather than adding up the team rows.
