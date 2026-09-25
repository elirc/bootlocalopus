-- Events imported from a partner's export. external_id is the partner's id:
-- unique, so importing the same event twice is a constraint violation.
create table events (
  id serial primary key,
  external_id text not null unique,
  kind text not null,
  occurred_at timestamptz not null,
  payload jsonb not null
);

insert into events (external_id, kind, occurred_at, payload) values
  ('ext-existing', 'signup', '2024-01-01T00:00:00Z', '{"plan": "free"}');
