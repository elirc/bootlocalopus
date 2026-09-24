-- A: equality column first, then the column you order by.
create index orders_customer_placed_idx on orders (customer_id, placed_at desc);

-- B: pending is a tiny slice, so keep only those rows in the index.
create index orders_pending_idx on orders (placed_at) where status = 'pending';

-- C: filtering on lower(email) needs an index on lower(email).
create unique index customers_email_lower_idx on customers (lower(email));
