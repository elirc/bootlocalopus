create table products (
  id serial primary key,
  sku text not null unique
);

create table stock_counts (
  product_id int not null references products(id),
  counted_on date not null,
  quantity int not null,
  primary key (product_id, counted_on)
);

insert into products (sku) values ('CB-2'), ('KB-1'), ('MS-3'), ('WC-4');

insert into stock_counts (product_id, counted_on, quantity) values
  -- KB-1: counted before the range, then twice inside it.
  (2, '2024-02-27', 40),
  (2, '2024-03-03', 35),
  (2, '2024-03-06', 0),
  -- CB-2: first counted on the 2nd, so the 1st is unknown.
  (1, '2024-03-02', 120),
  (1, '2024-03-07', 110),
  -- MS-3: counted after the range only; unknown throughout.
  (3, '2024-03-09', 15);
  -- WC-4: never counted.
