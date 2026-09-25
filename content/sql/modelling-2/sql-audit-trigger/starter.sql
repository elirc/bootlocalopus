create table account_audit (
  id bigserial primary key
  -- TODO: the other columns
);

create function audit_account() returns trigger
language plpgsql as $$
begin
  -- TODO: one audit row per changed account row
  return null;
end;
$$;

-- TODO: attach the trigger to accounts
