-- A foreign key is "covered" when some index on the referencing table has
-- the key's columns as its leading key columns, in any order: that is the
-- index a DELETE on the parent (or a join from it) can search. Partial
-- indexes do not count (they miss rows), and neither do INCLUDE columns
-- (they are stored, not searchable).
create view unindexed_foreign_keys as
select
  t.relname::text as table_name,
  c.conname::text as constraint_name,
  (
    select string_agg(a.attname, ', ' order by k.ord)
    from unnest(c.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
  ) as columns
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where c.contype = 'f'
  and n.nspname = 'public'
  and not exists (
    select 1
    from pg_index i
    where i.indrelid = c.conrelid
      and i.indisvalid
      and i.indpred is null
      and i.indnkeyatts >= cardinality(c.conkey)
      -- indkey is 0-based; compare its first n key columns with the FK's
      -- columns as sets.
      and (select array_agg(x order by x) from unnest((i.indkey::int2[])[0:cardinality(c.conkey) - 1]) as x)
        = (select array_agg(x order by x) from unnest(c.conkey) as x)
  );

-- The report itself.
select * from unindexed_foreign_keys order by table_name, constraint_name;
