create table doctors (
  id serial primary key,
  name text not null
);

-- Rule: at least one doctor must stay on call for every shift. Two doctors
-- going off call at once, each seeing the other still on call, is the
-- textbook write skew that only SERIALIZABLE catches.
create table on_call (
  shift date not null,
  doctor_id integer not null references doctors(id),
  primary key (shift, doctor_id)
);

insert into doctors (name) values ('Alice'), ('Bob'), ('Carol');
insert into on_call (shift, doctor_id) values
  ('2024-03-01', 1), ('2024-03-01', 2),
  ('2024-03-02', 3);
