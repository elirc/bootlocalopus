create table tenants (
  id text primary key,
  name text not null
);

-- Invoice numbers are per tenant, start at 1, and the tax office expects no
-- gaps: invoice 7 existing without an invoice 6 needs explaining in an audit.
create table invoices (
  id serial primary key,
  tenant_id text not null references tenants(id),
  number integer not null,
  amount_cents integer not null check (amount_cents > 0),
  issued_at timestamptz not null default now(),
  unique (tenant_id, number)
);

insert into tenants (id, name) values
  ('acme', 'Acme Ltd'),
  ('globex', 'Globex plc'),
  ('initech', 'Initech');

-- Acme has been invoicing since before this change; Globex was numbered by
-- hand once and is already at 12. Initech has never issued an invoice.
insert into invoices (tenant_id, number, amount_cents) values
  ('acme', 1, 12000),
  ('acme', 2, 4500),
  ('acme', 3, 990),
  ('globex', 11, 50000),
  ('globex', 12, 7300);
