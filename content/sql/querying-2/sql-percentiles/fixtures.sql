create table request_logs (
  id serial primary key,
  endpoint text not null,
  status int not null,
  duration_ms int not null
);

insert into request_logs (endpoint, status, duration_ms) values
  ('GET /users', 200, 12), ('GET /users', 200, 15), ('GET /users', 200, 11),
  ('GET /users', 200, 14), ('GET /users', 200, 13), ('GET /users', 200, 16),
  ('GET /users', 200, 18), ('GET /users', 200, 20), ('GET /users', 503, 250),
  ('GET /users', 200, 17),
  ('POST /orders', 201, 120), ('POST /orders', 201, 80), ('POST /orders', 500, 95),
  ('POST /orders', 201, 300), ('POST /orders', 502, 110), ('POST /orders', 201, 105),
  ('GET /health', 200, 1), ('GET /health', 200, 1), ('GET /health', 500, 2),
  ('GET /health', 200, 1);

-- GET /search: 20 requests from 30 ms to 220 ms, one of them a 504.
insert into request_logs (endpoint, status, duration_ms)
select 'GET /search', case when g = 7 then 504 else 200 end, 20 + g * 10
from generate_series(1, 20) as g;
