-- TODO: one CREATE INDEX that turns the plan into an Index Only Scan with no Sort.
create index orders_customer_recent_idx on orders
