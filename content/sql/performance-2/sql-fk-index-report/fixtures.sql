create table customers (id serial primary key, email text not null);
create table products (id serial primary key, name text not null);
create table categories (
  id serial primary key,
  parent_id integer references categories(id),
  name text not null
);

create table orders (
  id serial primary key,
  customer_id integer not null references customers(id),
  placed_at timestamptz not null default now()
);
create index orders_customer_id_idx on orders (customer_id);

create table order_items (
  order_id integer not null references orders(id),
  product_id integer not null references products(id),
  qty integer not null,
  primary key (order_id, product_id)
);

create table payments (
  id serial primary key,
  order_id integer not null references orders(id),
  amount_cents integer not null
);

create table refunds (
  id serial primary key,
  payment_id integer not null references payments(id),
  status text not null
);
create index refunds_pending_idx on refunds (payment_id) where status = 'pending';

create table shipments (
  id serial primary key,
  order_id integer not null references orders(id),
  carrier text not null
);
create index shipments_carrier_order_idx on shipments (carrier, order_id);

create table invoices (
  id serial primary key,
  customer_id integer not null references customers(id),
  order_id integer not null references orders(id)
);
create index invoices_order_customer_idx on invoices (order_id, customer_id);

create table attachments (
  id serial primary key,
  order_id integer not null references orders(id),
  url text not null
);
create index attachments_id_incl_idx on attachments (id) include (order_id);

create table tenant_users (
  tenant_id integer not null,
  user_id integer not null,
  primary key (tenant_id, user_id)
);

create table memberships (
  tenant_id integer not null,
  user_id integer not null,
  role text not null,
  foreign key (tenant_id, user_id) references tenant_users (tenant_id, user_id)
);
create index memberships_user_tenant_idx on memberships (user_id, tenant_id, role);

create table membership_events (
  id serial primary key,
  tenant_id integer not null,
  user_id integer not null,
  foreign key (tenant_id, user_id) references tenant_users (tenant_id, user_id)
);
create index membership_events_tenant_idx on membership_events (tenant_id);
