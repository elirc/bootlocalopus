-- Today every "results" label runs an exact count(*). On the big account
-- that is a scan of millions of rows, every time someone opens the page.

create function estimated_count(p_query text) returns bigint
language plpgsql
as $$
declare
  n bigint;
begin
  execute 'select count(*) from (' || p_query || ') as q' into n;
  return n;
end;
$$;

create function table_row_estimate(p_table regclass) returns bigint
language plpgsql
as $$
declare
  n bigint;
begin
  execute format('select count(*) from %s', p_table) into n;
  return n;
end;
$$;

create function account_event_count(p_account integer)
returns table (count bigint, exact boolean)
language sql stable
as $$
  select count(*), true from events where account_id = p_account;
$$;
