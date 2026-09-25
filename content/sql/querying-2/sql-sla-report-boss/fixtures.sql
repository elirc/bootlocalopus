create table teams (
  id serial primary key,
  name text not null unique
);

create table sla_policies (
  priority text primary key,
  first_response_minutes int not null
);

create table tickets (
  id serial primary key,
  team_id int not null references teams(id),
  priority text not null references sla_policies(priority),
  created_at timestamptz not null
);

create table ticket_events (
  id serial primary key,
  ticket_id int not null references tickets(id),
  kind text not null check (kind in ('agent_reply', 'customer_reply', 'status_change')),
  status text,
  happened_at timestamptz not null,
  check ((kind = 'status_change') = (status is not null))
);

insert into teams (name) values ('Billing'), ('Platform'), ('Onboarding');

insert into sla_policies (priority, first_response_minutes) values
  ('urgent', 60), ('high', 240), ('normal', 1440);

insert into tickets (team_id, priority, created_at) values
  (1, 'urgent', '2024-04-01 08:00+00'),  -- 1 Billing: 30 min, resolved
  (1, 'high',   '2024-04-01 06:00+00'),  -- 2 Billing: 280 min (breach), pending
  (1, 'normal', '2024-03-31 09:00+00'),  -- 3 Billing: no reply, deadline passed (breach)
  (1, 'urgent', '2024-04-01 11:30+00'),  -- 4 Billing: no reply, deadline 12:30 not passed
  (2, 'high',   '2024-03-30 10:00+00'),  -- 5 Platform: exactly 240 min, reopened
  (2, 'normal', '2024-03-29 12:00+00'),  -- 6 Platform: 45 min, resolved+closed same instant
  (2, 'urgent', '2024-03-31 08:00+00'),  -- 7 Platform: 250 min (breach), resolved
  (1, 'normal', '2024-03-31 20:00+00');  -- 8 Billing: 290 min, closed

insert into ticket_events (ticket_id, kind, status, happened_at) values
  (1, 'agent_reply',    null,       '2024-04-01 08:30+00'),
  (1, 'status_change',  'resolved', '2024-04-01 09:00+00'),
  (2, 'customer_reply', null,       '2024-04-01 06:30+00'),
  (2, 'agent_reply',    null,       '2024-04-01 10:40+00'),
  (2, 'status_change',  'pending',  '2024-04-01 10:41+00'),
  (5, 'customer_reply', null,       '2024-03-30 10:05+00'),
  (5, 'agent_reply',    null,       '2024-03-30 14:00+00'),
  (5, 'status_change',  'resolved', '2024-03-30 15:00+00'),
  (5, 'status_change',  'reopened', '2024-03-31 09:00+00'),
  (6, 'agent_reply',    null,       '2024-03-29 13:30+00'),
  (6, 'agent_reply',    null,       '2024-03-29 12:45+00'),
  (6, 'status_change',  'resolved', '2024-03-29 14:00+00'),
  (6, 'status_change',  'closed',   '2024-03-29 14:00+00'),
  (7, 'agent_reply',    null,       '2024-03-31 12:10+00'),
  (7, 'status_change',  'resolved', '2024-03-31 13:00+00'),
  (8, 'agent_reply',    null,       '2024-04-01 00:50+00'),
  (8, 'status_change',  'closed',   '2024-04-01 01:00+00');
