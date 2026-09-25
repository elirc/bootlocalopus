create table order_statuses (
  code text primary key,
  is_terminal boolean not null
);

-- TODO: the five statuses, the transitions table and its five rows,
-- the foreign key on orders.status, and the trigger.
