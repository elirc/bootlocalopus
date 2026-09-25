"You're on a 5-day streak!" needs the runs of consecutive active days per
user. Looping over rows in application code works until the table has fifty
million rows. In SQL this is the **gaps-and-islands** pattern, and it rests
on one observation:

> Number each user's active days in order with `row_number()`. Within a run
> of consecutive days, the day and the row number both go up by one, so
> `day - row_number` is the **same date** for every day of the run — and a
> different one for the next run.

Group by that value and each group is an island: `min(day)` is the start,
`max(day)` the end, `count(*)` the length.

The pattern only works on **one row per user per day**. The raw table has an
event per action — several a day — so deduplicate first (`select distinct`);
otherwise the row number runs ahead of the date and a run splits in two.
Days are calendar days in **UTC**: `(happened_at at time zone 'UTC')::date`.

The fixture has `users(id, name)` and `activity(id, user_id, happened_at
timestamptz)`.

## Task

One query returning every streak (island) of every user:

| column | value |
| --- | --- |
| `name` | the user's name |
| `streak_start` | first day, as text `'YYYY-MM-DD'` |
| `streak_end` | last day, as text `'YYYY-MM-DD'` |
| `days` | the number of days in the streak (an integer) |

A single active day on its own is a streak of 1. Users with no activity do
not appear. Order by `name`, then `streak_start`.
