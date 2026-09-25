Background work fails quietly. A request that breaks returns a 500 someone
sees; a job that breaks, runs twice, or never runs is usually discovered by a
customer, days later.

These are the design calls that decide whether a queue-based system is
boring or haunted: what "at-least-once" obliges your handlers to do, what to
put in a job, when to retry, and where the queue meets your database
transaction.
