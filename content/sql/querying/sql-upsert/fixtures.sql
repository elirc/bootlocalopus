create table page_views (
  page text primary key,
  views int not null,
  last_seen timestamptz not null
);

insert into page_views (page, views, last_seen) values
  ('/', 10, now() - interval '1 day'),
  ('/pricing', 3, now() - interval '2 hours');