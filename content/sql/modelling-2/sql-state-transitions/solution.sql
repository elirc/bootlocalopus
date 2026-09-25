create table order_statuses (
  code text primary key,
  is_terminal boolean not null
);

insert into order_statuses (code, is_terminal) values
  ('pending', false),
  ('paid', false),
  ('shipped', false),
  ('delivered', true),
  ('cancelled', true);

create table order_status_transitions (
  from_status text not null references order_statuses(code),
  to_status text not null references order_statuses(code),
  primary key (from_status, to_status)
);

insert into order_status_transitions (from_status, to_status) values
  ('pending', 'paid'),
  ('pending', 'cancelled'),
  ('paid', 'shipped'),
  ('paid', 'cancelled'),
  ('shipped', 'delivered');

alter table orders
  add constraint orders_status_fkey foreign key (status) references order_statuses(code);

create function check_order_transition() returns trigger
language plpgsql as $$
begin
  -- Only a real change of status is a transition.
  if new.status is distinct from old.status and not exists (
    select 1
    from order_status_transitions t
    where t.from_status = old.status and t.to_status = new.status
  ) then
    raise exception 'invalid transition % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger orders_status_transition
before update of status on orders
for each row execute function check_order_transition();
