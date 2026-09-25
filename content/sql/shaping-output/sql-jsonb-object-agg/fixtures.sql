create table users (
  id serial primary key,
  email text not null unique
);

-- Every setting the app knows about, with its default value.
create table setting_defaults (
  key text primary key,
  value jsonb not null
);

-- What each user changed. No foreign key to setting_defaults: settings get
-- retired, and old overrides for them are still lying around.
create table user_settings (
  user_id int not null references users(id),
  key text not null,
  value jsonb not null,
  primary key (user_id, key)
);

insert into users (email) values
  ('ada@example.com'),   -- 1: two overrides
  ('bob@example.com'),   -- 2: no overrides at all
  ('chen@example.com'),  -- 3: an override for a retired setting, and an explicit JSON null
  ('dara@example.com');  -- 4: overrides a boolean to false

insert into setting_defaults (key, value) values
  ('theme',          '"light"'),
  ('digest',         '"weekly"'),
  ('page_size',      '25'),
  ('beta_features',  'true'),
  ('timezone',       '"UTC"');

insert into user_settings (user_id, key, value) values
  (1, 'theme',         '"dark"'),
  (1, 'page_size',     '50'),
  (3, 'legacy_sidebar', 'true'),
  (3, 'digest',        'null'),
  (4, 'beta_features', 'false');
