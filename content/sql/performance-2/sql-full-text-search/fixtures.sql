create table articles (
  id serial primary key,
  title text not null,
  body text not null,
  published boolean not null default true
);

insert into articles (title, body, published) values
  ('Postgres indexing guide',
   'B-tree, GIN and BRIN: which index fits which query, and what each one costs on writes.', true),
  ('Weekly engineering notes',
   'We upgraded the Postgres cluster and deployed the new billing service on Tuesday.', true),
  ('Deploying on Fridays',
   'Our deployments are boring now: small batches, feature flags and a fast rollback.', true),
  ('Connection pool sizing',
   'A connection pool that is too large makes Postgres slower, not faster. Start small.', true),
  ('Caching with Redis',
   'Cache-aside with Redis: read through, invalidate on write, and set a TTL on every key.', true),
  ('Memcached in 2024',
   'Memcached is still a fine cache when all you need is a volatile key-value store.', true),
  ('Streaming replication',
   'Postgres replication with a hot standby: lag, failover and what replicas cannot do.', true),
  ('Pool party',
   'The office pool reopens in June. Towels are provided at the connection between the two buildings.', true),
  ('Draft: sharding Postgres',
   'Unpublished notes about sharding Postgres by tenant.', false),
  ('Incident review: the checkout outage',
   'A migration took an ACCESS EXCLUSIVE lock during peak traffic and checkout timed out.', true),
  ('Testing database code',
   'Run tests against a real Postgres, reset between tests, and never mock the query builder.', true),
  ('On-call handbook',
   'How we page, who we page, and the runbooks for the checkout and billing services.', true),
  ('Platform team update',
   'Kubernetes upgrades are finished, and Kubernetes costs are down a third.', true),
  ('Kubernetes for beginners',
   'Start with pods and services; leave operators for later.', true);

-- Filler so the table is not trivially small.
insert into articles (title, body, published)
select 'Changelog ' || g, 'Minor fixes and dependency updates, batch ' || g || '.', true
from generate_series(1, 300) as g;
