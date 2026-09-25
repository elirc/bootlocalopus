Most modelling decisions are not right or wrong; they are cheap now and
expensive later, or the other way round. These are the calls that come up in
design reviews on a Postgres codebase — enum or lookup table, which kind of
primary key, what soft delete really costs, when a JSON column is fine, and
when a "derived" value is actually a fact.

For each question, pick the answer you would defend in a review. Some
questions have more than one correct option; they say so.
