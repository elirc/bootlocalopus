-- A first attempt: "a foreign key column that appears in any index".
-- It misses keys that sit second in an index, in a partial index, or only
-- in an INCLUDE list, and it cannot handle multi-column keys.
create view unindexed_foreign_keys as
select
  t.relname::text as table_name,
  c.conname::text as constraint_name,
  a.attname::text as columns
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
where c.contype = 'f'
  and not exists (
    select 1 from pg_index i
    where i.indrelid = c.conrelid and c.conkey[1] = any (i.indkey::int2[])
  );

select * from unindexed_foreign_keys order by table_name, constraint_name;
