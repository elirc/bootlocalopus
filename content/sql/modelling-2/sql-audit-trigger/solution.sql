create table account_audit (
  id bigserial primary key,
  -- Deliberately no foreign key: the history has to survive the delete.
  account_id int not null,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  actor text,
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);

create index account_audit_account_id_idx on account_audit (account_id, changed_at);

create function audit_account() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into account_audit (account_id, op, actor, new_row)
    values (new.id, tg_op, current_setting('app.actor', true), to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    -- The trigger's WHEN clause already skips no-op updates; this is the
    -- belt to its braces if someone attaches the function elsewhere.
    if old is distinct from new then
      insert into account_audit (account_id, op, actor, old_row, new_row)
      values (new.id, tg_op, current_setting('app.actor', true), to_jsonb(old), to_jsonb(new));
    end if;
  else
    insert into account_audit (account_id, op, actor, old_row)
    values (old.id, tg_op, current_setting('app.actor', true), to_jsonb(old));
  end if;
  -- The return value of an AFTER trigger is ignored.
  return null;
end;
$$;

create trigger accounts_audit_write
after insert or delete on accounts
for each row execute function audit_account();

-- IS DISTINCT FROM treats nulls as values, so null -> null is "no change".
create trigger accounts_audit_update
after update on accounts
for each row
when (old.* is distinct from new.*)
execute function audit_account();
