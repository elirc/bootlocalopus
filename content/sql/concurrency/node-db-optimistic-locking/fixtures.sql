create table documents (
  id serial primary key,
  title text not null,
  body text not null,
  -- Bumped by every successful save. A writer states the version it read;
  -- if the row has moved on since, somebody else saved in between.
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

insert into documents (title, body) values
  ('Onboarding', 'Day 1: laptop.'),
  ('Runbook', 'Restart the worker.'),
  ('Roadmap', 'Q1: search.');
