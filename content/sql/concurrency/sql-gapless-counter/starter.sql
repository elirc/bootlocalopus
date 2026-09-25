-- What is in production: one sequence for everyone. It is fast and never
-- blocks, and that is exactly why it has gaps. Replace it.
create sequence invoice_number_seq;

create function next_invoice_number(p_tenant text) returns integer
language sql
as $$
  select nextval('invoice_number_seq')::integer;
$$;

create function create_invoice(p_tenant text, p_amount_cents integer) returns invoices
language sql
as $$
  insert into invoices (tenant_id, number, amount_cents)
  values (p_tenant, next_invoice_number(p_tenant), p_amount_cents)
  returning *;
$$;
