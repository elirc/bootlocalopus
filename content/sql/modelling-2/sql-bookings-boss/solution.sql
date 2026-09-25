create table bookings (
  id serial primary key,
  room_id int not null references rooms(id),
  booked_by text not null,
  attendees int not null check (attendees > 0),
  during tstzrange not null,
  cancelled_at timestamptz,

  constraint bookings_during_not_empty check (not isempty(during)),
  constraint bookings_during_bounded check (not lower_inf(during) and not upper_inf(during)),
  -- [) everywhere, so back-to-back bookings touch without overlapping.
  constraint bookings_during_half_open check (lower_inc(during) and not upper_inc(during)),
  constraint bookings_during_max_4h check (upper(during) - lower(during) <= interval '4 hours'),

  -- The rule that cannot be enforced by "check, then insert". In production:
  -- create extension btree_gist, then `room_id with =`. Without it, a
  -- one-element int4range compares rooms with an operator GiST has built in.
  constraint bookings_no_double_booking exclude using gist (
    int4range(room_id, room_id, '[]') with =,
    during with &&
  ) where (cancelled_at is null)
);

-- A rule that spans two tables is a trigger, not a CHECK.
create function check_booking_capacity() returns trigger
language plpgsql as $$
begin
  if new.attendees > (select r.capacity from rooms r where r.id = new.room_id) then
    raise exception 'room capacity exceeded'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger bookings_capacity
before insert or update of attendees, room_id on bookings
for each row execute function check_booking_capacity();

create function free_rooms(p_during tstzrange, p_attendees int)
returns table (room_id int, name text, capacity int)
language sql stable as $$
  select r.id, r.name, r.capacity
  from rooms r
  where r.capacity >= p_attendees
    and not exists (
      select 1
      from bookings b
      where b.room_id = r.id
        and b.cancelled_at is null
        and b.during && p_during
    )
  order by r.capacity, r.id;
$$;
