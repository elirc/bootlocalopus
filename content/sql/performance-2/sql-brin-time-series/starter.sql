-- Index both time columns, and end with the query that shows how well each
-- column's order follows the table's physical order.

select attname, correlation
from pg_stats
where tablename = 'readings'
order by attname;
