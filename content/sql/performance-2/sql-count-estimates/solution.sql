-- The planner's row estimate for a query, without running it. Only ever
-- pass SQL your own code built: this executes the text it is given.
create function estimated_count(p_query text) returns bigint
language plpgsql
as $$
declare
  plan json;
begin
  execute 'explain (format json) ' || p_query into plan;
  return (plan -> 0 -> 'Plan' ->> 'Plan Rows')::bigint;
end;
$$;

-- The whole-table estimate the planner itself starts from. reltuples is -1
-- until the table has been analyzed or vacuumed: unknown, not empty.
create function table_row_estimate(p_table regclass) returns bigint
language sql stable
as $$
  select case when reltuples < 0 then null else reltuples::bigint end
  from pg_class
  where oid = p_table;
$$;

-- Exact when it is cheap to be exact, an estimate when it is not. Counting
-- at most 1,001 rows costs the same for a small account and a huge one.
create function account_event_count(p_account integer)
returns table (count bigint, exact boolean)
language plpgsql stable
as $$
declare
  n bigint;
begin
  select count(*) into n
  from (select 1 from events where account_id = p_account limit 1001) as capped;

  if n <= 1000 then
    return query select n, true;
  else
    return query select estimated_count(format('select 1 from events where account_id = %s', p_account)), false;
  end if;
end;
$$;
