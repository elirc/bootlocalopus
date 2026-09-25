-- One row per tenant holding the last number handed out. Unlike a sequence,
-- this row is ordinary transactional data: a rollback puts it back.
create table invoice_counters (
  tenant_id text primary key references tenants(id),
  last_number integer not null check (last_number >= 0)
);

-- Carry on from the numbers already issued.
insert into invoice_counters (tenant_id, last_number)
select tenant_id, max(number)
from invoices
group by tenant_id;

-- The upsert both creates the counter on first use and increments it. Its
-- UPDATE takes a row lock on the tenant's counter, so a second transaction
-- numbering for the same tenant waits here until the first commits or rolls
-- back, then increments the value that actually survived.
create function next_invoice_number(p_tenant text) returns integer
language sql
as $$
  insert into invoice_counters as c (tenant_id, last_number)
  values (p_tenant, 1)
  on conflict (tenant_id) do update
    set last_number = c.last_number + 1
  returning last_number;
$$;

-- Number and invoice in one statement's transaction: if the insert fails,
-- the increment is undone with it and the number is not burnt.
create function create_invoice(p_tenant text, p_amount_cents integer) returns invoices
language sql
as $$
  insert into invoices (tenant_id, number, amount_cents)
  values (p_tenant, next_invoice_number(p_tenant), p_amount_cents)
  returning *;
$$;
